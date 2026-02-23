// authentication state
let authToken = null;
// whether current user is an admin (controls adminNav and hidden admin section)
let isAdmin = false;
// admin role is handled in separate owner/admin panel; index page treats all users the same
let manualMode = false; // true when user signed in with name+phone without a valid JWT

// owner/admin dashboard token (separate from regular user auth)
let adminToken = null;

// determine API base URL (so that fetch works when static files are served via
// Live Server on a different port). If current origin is not port 3000 we assume
// the backend lives at http://localhost:3000.
const API_BASE = (function() {
    const loc = window.location;
    return (loc.port && loc.port !== '3000') ? 'http://localhost:3000' : '';
})();
function apiFetch(path, opts) {
    return fetch(API_BASE + path, opts);
}

// Data will now be stored on the backend; frontend fetches it via API
let donors = {};
let localDonorsCache = []; // donors added when backend unavailable
let currentInstitution = null;
let currentFilter = 'All';
let searchQuery = '';

// localStorage helpers
function saveCache() {
    try { localStorage.setItem('donorCache', JSON.stringify(localDonorsCache)); } catch {}
}
function loadCache() {
    try { const v = localStorage.getItem('donorCache'); if (v) localDonorsCache = JSON.parse(v); } catch {}
}

// build headers for fetch calls; skip Authorization when in manual mode or no token
function authHeaders(contentType = 'application/json') {
    const headers = {};
    if (contentType) headers['Content-Type'] = contentType;
    if (authToken && !manualMode) headers['Authorization'] = 'Bearer ' + authToken;
    return headers;
}

// add donor to local data structure and re‑render lists
function addLocalDonor(donor) {
    // record in cache so we can reapply after fresh loads
    localDonorsCache.push(donor);
    saveCache();
    if (!donors[donor.institution]) donors[donor.institution] = [];
    donors[donor.institution].push(donor);
    renderLists();
}

// Google credential callback (called by GSI)
async function handleCredentialResponse(response) {
    try {
        const res = await apiFetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: response.credential })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed');
        authToken = data.token;
        isAdmin = !!data.isAdmin;
        localStorage.setItem('authToken', authToken);
        showDashboard();
    } catch (err) {
        console.error('login error', err);
        alert('Login failed: ' + err.message);
    }
}

// manual sign‑in (name + phone number)
async function manualSignIn() {
    const name = document.getElementById('manualName').value.trim();
    const phone = document.getElementById('manualPhone').value.trim();
    const msgDiv = document.getElementById('manualLoginMsg');
    msgDiv.textContent = '';

    if (!name || !phone) {
        msgDiv.textContent = 'Please provide both name and phone number';
        msgDiv.className = 'message error';
        return;
    }
    // basic phone validation – digits, optional +, 6–15 characters
    if (!/^\+?[0-9]{6,15}$/.test(phone)) {
        msgDiv.textContent = 'Phone number format is invalid';
        msgDiv.className = 'message error';
        return;
    }

    // try contacting backend; if that fails we'll fall back to offline mode
    try {
        const res = await apiFetch('/api/auth/manual', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name, phone })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            authToken = data.token;
            isAdmin = !!data.isAdmin;
            manualMode = false;
            localStorage.setItem('authToken', authToken);
            showDashboard();
            return;
        } else {
            throw new Error(data.error || 'Authentication failed');
        }
    } catch (err) {
        console.warn('manual sign-in backend error:', err);
        // offline/unauthorized path
        manualMode = true;
        authToken = null;
        isAdmin = false;
        localStorage.removeItem('authToken');
        localStorage.setItem('manualMode','true');
        msgDiv.textContent = 'Working offline – not authenticated';
        msgDiv.className = 'message';
        showDashboard();
    }
}

// check for existing token or offline flag on page load
function initAuth() {
    loadCache();
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        // if looks like a JWT try decode, otherwise ignore
        if (token.split('.').length === 3) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                isAdmin = !!payload.isAdmin;
            } catch (e) {
                console.warn('invalid stored JWT, clearing');
                localStorage.removeItem('authToken');
                authToken = null;
                return;
            }
        } else {
            authToken = null;
        }
    }
    // manual flag persisted as well
    if (!authToken && localStorage.getItem('manualMode') === 'true') {
        manualMode = true;
    }
    if (authToken || manualMode) showDashboard();
}

async function showDashboard() {
    // require some form of sign‑in to move forward
    if (!authToken && !manualMode) {
        alert('Unable to show dashboard: no authentication token');
        return;
    }
    // reveal navigation
    document.querySelector('nav').style.display = 'flex';
    // show admin tools link if user has admin privileges
    document.getElementById('adminNav').style.display = isAdmin ? 'inline-block' : 'none';
    // hide login section and show home
    document.getElementById('login').style.display = 'none';
    document.getElementById('home').style.display = '';
    try { await loadDonors(); } catch {}
    showSection('home');
}

function logout() {
    authToken = null;
    isAdmin = false;
    manualMode = false;
    localStorage.removeItem('authToken');
    localStorage.removeItem('manualMode');
    localStorage.removeItem('donorCache');
    document.querySelector('nav').style.display = 'none';
    document.getElementById('adminNav').style.display = 'none';
    document.getElementById('login').style.display = '';
    showSection('login');
    // also tell Google to forget auto select
    if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
}

// Show/hide sections
function showSection(sectionId) {
    // allow navigation if user either has a valid token or is in manual/offline mode
    if (!authToken && !manualMode && sectionId !== 'login' && sectionId !== 'ownerPanel') {
        alert('You must sign in first');
        return;
    }
    // show nav only for normal app pages when user is signed in
    if (sectionId !== 'ownerPanel' && (authToken || manualMode)) {
        document.querySelector('nav').style.display = 'flex';
    }
    // hide all sections and remove active state; also reset any inline display overrides
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    const section = document.getElementById(sectionId);
    if (section) {
        // clear inline style to allow CSS rules to take effect (fixes ownerPanel blank issue)
        section.style.display = '';
        section.classList.add('active');
    }
    if (section) {
        section.classList.add('active');
    }
    
    // hide top navigation when viewer is in the owner panel
    if (sectionId === 'ownerPanel') {
        document.querySelector('nav').style.display = 'none';
    }

    // render dynamic areas when they become visible
    if (sectionId === 'lists') {
        renderLists();
    } else if (sectionId === 'institutionDetails') {
        renderInstitutionDetails();
    } else if (sectionId === 'ownerPanel') {
        // when owner panel is shown fetch latest admin status/data
        ownerCheckAdminStatus();
    }
}


// Register a new donor
async function registerDonor(e) {
    e.preventDefault();
    
    const institution = document.getElementById('institution').value.trim();
    const name = document.getElementById('name').value.trim();
    const age = document.getElementById('age').value.trim();
    const bloodGroup = document.getElementById('bloodGroup').value.trim();
    const contact = document.getElementById('contact').value.trim();
    const address = document.getElementById('address').value.trim();
    
    // Validation
    if (!institution || !name || !age || !bloodGroup || !contact || !address) {
        showMessage('registerMessage', 'Please fill all fields', 'error');
        return;
    }
    
    if (age < 17) {
        showMessage('registerMessage', 'Age must be at least 17', 'error');
        return;
    }

    const donorObj = { institution, name, age, bloodGroup, contact, address };
    // attempt to send to backend
    try {
        const res = await apiFetch('/api/donors', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(donorObj)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to register');
        }
        showMessage('registerMessage', 'Registered successfully!', 'success');
        this.reset();
        await loadDonors();
        return;
    } catch (err) {
        // backend call failed (unauthorized, offline, etc). keep donor locally so user sees it.
        showMessage('registerMessage', 'Saved locally – login or check network to sync', 'success');
        addLocalDonor(donorObj);
    }
}
document.getElementById('registerForm').addEventListener('submit', registerDonor);

// Show message helper
function showMessage(elementId, message, type) {
    const messageDiv = document.getElementById(elementId);
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = 'message ' + type;
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = 'message';
        }, 4000);
    }
}

// Search functionality
function searchDonors() {
    searchQuery = document.getElementById('searchBar').value.toLowerCase().trim();
    renderLists();
}

// Render the donor lists with search filter
function renderLists() {
    const listsDiv = document.getElementById('donorLists');
    const emptyState = document.getElementById('emptyState');
    listsDiv.innerHTML = '';
    
    let foundAny = false;
    
    for (const institution in donors) {
        // Filter institutions by search query
        const institutionMatch = institution.toLowerCase().includes(searchQuery);
        
        // Filter students within institution by search query
        let studentsMatch = [];
        if (searchQuery) {
            studentsMatch = donors[institution].filter(student => 
                student.name.toLowerCase().includes(searchQuery)
            );
        } else {
            studentsMatch = donors[institution];
        }
        
        // Show institution if it matches or if any students match
        if (institutionMatch || studentsMatch.length > 0) {
            foundAny = true;
            const instDiv = document.createElement('div');
            instDiv.className = 'institution';
            
            const instHeader = document.createElement('h3');
            instHeader.textContent = `${institution} (${studentsMatch.length} donor${studentsMatch.length !== 1 ? 's' : ''})`;
            instHeader.onclick = () => viewInstitution(institution);
            instDiv.appendChild(instHeader);
            
            listsDiv.appendChild(instDiv);
        }
    }
    
    // Show empty state if no results
    if (!foundAny) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
    }
}

// Navigate to institution details
function viewInstitution(institution) {
    currentInstitution = institution;
    currentFilter = 'All';
    showSection('institutionDetails');
}

// Render institution details with filters and donors
function renderInstitutionDetails() {
    if (!currentInstitution) return;
    
    document.getElementById('detailsTitle').textContent = `Registered Donors - ${currentInstitution}`;
    
    // Render blood group filters
    const filtersDiv = document.getElementById('bloodGroupFilters');
    filtersDiv.innerHTML = '';
    const bloodGroups = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    
    bloodGroups.forEach(group => {
        const block = document.createElement('div');
        block.className = 'blood-group-block';
        if (group === currentFilter) block.classList.add('active');
        block.textContent = group;
        block.onclick = () => filterStudents(group);
        filtersDiv.appendChild(block);
    });
    
    // Render donor list (filtered)
    const studentListDiv = document.getElementById('studentList');
    const emptyStudents = document.getElementById('emptyStudents');
    
    studentListDiv.innerHTML = '';
    
    const students = donors[currentInstitution].filter(student => 
        currentFilter === 'All' || student.bloodGroup === currentFilter
    );
    
    if (students.length === 0) {
        emptyStudents.style.display = 'block';
        return;
    } else {
        emptyStudents.style.display = 'none';
    }
    
    students.forEach((student, index) => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student';
        let inner = `
            <div class="student-info">
                <div class="student-header">
                    <span class="student-name">${student.name}</span>
                    <span class="student-blood-group">${student.bloodGroup}</span>
                </div>
                <div class="student-details">
                    <p><strong>Age:</strong> ${student.age}</p>
                    <p><strong>Contact:</strong> ${student.contact}</p>
                    <p><strong>Address:</strong> ${student.address}</p>
                </div>
            </div>
        `;
        studentDiv.innerHTML = inner;
        studentListDiv.appendChild(studentDiv);
    });
}

// Filter students by blood group
function filterStudents(bloodGroup) {
    currentFilter = bloodGroup;
    renderInstitutionDetails();
}

// Add a new institution
async function addInstitution() {
    const institution = prompt('Enter new institution name:');
    if (institution && institution.trim()) {
        const trimmedInst = institution.trim();
        try {
            const res = await apiFetch('/api/institutions', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: trimmedInst })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Unable to add');
            }
            alert(`Institution "${trimmedInst}" added successfully!`);
            await loadDonors();
            renderLists();
        } catch (err) {
            // offline / unauthorized: keep institution locally so user can still add donors later
            alert(err.message + ' (added locally)');
            if (!donors[trimmedInst]) {
                donors[trimmedInst] = [];
                renderLists();
            }
        }
    }
}



// Clear search functionality
function clearSearch() {
    document.getElementById('searchBar').value = '';
    searchQuery = '';
    renderLists();
}

// Initialize with home section
// helper to load donors from backend
async function loadDonors() {
    try {
        const res = await apiFetch('/api/donors', {
            headers: authHeaders(),
        });
        donors = await res.json();
        // merge any locally cached entries
        if (localDonorsCache.length) {
            localDonorsCache.forEach(donor => {
                if (!donors[donor.institution]) donors[donor.institution] = [];
                donors[donor.institution].push(donor);
            });
        }
    } catch (err) {
        console.error('Failed to load donors', err);
        // keep existing donors rather than clearing
    }
}


// ------ owner/admin panel helpers ------

// called when ownerPanel section becomes active
async function ownerCheckAdminStatus() {
    const firstEl = document.getElementById('firstAdminSection');
    const loginEl = document.getElementById('loginSection');
    try {
        const res = await apiFetch('/api/admins/status');
        if (!res.ok) throw new Error('status failed');
        const data = await res.json();
        firstEl.style.display = 'none';
        loginEl.style.display = 'none';
        if (data.exists) {
            loginEl.style.display = 'block';
        } else {
            firstEl.style.display = 'block';
        }
    } catch (err) {
        console.error('could not fetch admin status', err);
        firstEl.style.display = 'none';
        loginEl.style.display = 'block';
        const msg = document.getElementById('loginMessage');
        msg.textContent = 'Connection issue - please try again';
        msg.className = 'message';
    }
}

async function ownerCreateFirstAdmin() {
    const username = document.getElementById('firstAdminUsername').value;
    const pwd = document.getElementById('firstAdminPassword').value;
    const msg = document.getElementById('firstAdminMessage');
    msg.textContent = '';
    if (!username || !pwd) {
        msg.textContent = 'Provide username and password';
        msg.className = 'message error';
        return;
    }
    try {
        const res = await apiFetch('/api/first-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pwd })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Could not create');
        }
        // automatically log in with new credentials
        adminToken = null;
        document.getElementById('firstAdminSection').style.display = 'none';
        document.getElementById('adminUsername').value = username;
        document.getElementById('adminPassword').value = pwd;
        await ownerLogin();
    } catch (err) {
        msg.textContent = err.message;
        msg.className = 'message error';
    }
}

async function ownerLogin() {
    document.getElementById('firstAdminSection').style.display = 'none';

    const username = document.getElementById('adminUsername').value;
    const pwd = document.getElementById('adminPassword').value;
    const msgEl = document.getElementById('loginMessage');
    try {
        if (!username || !pwd) {
            msgEl.textContent = 'Please enter username and password';
            msgEl.className = 'message error';
            return;
        }
        const res = await apiFetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pwd })
        });
        if (!res.ok) {
            const errorData = await res.json();
            msgEl.textContent = errorData.error || 'Login failed';
            msgEl.className = 'message error';
            return;
        }
        const data = await res.json();
        adminToken = data.token;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        ownerLoadInstitutions();
    } catch (err) {
        msgEl.textContent = 'Error: ' + err.message;
        msgEl.className = 'message error';
    }
}

async function ownerCreateAdminUser() {
    const user = document.getElementById('newAdminUsername').value.trim();
    const pwd = document.getElementById('newAdminPassword').value;
    const msg = document.getElementById('newAdminMsg');
    msg.textContent = '';
    if (!user || !pwd) {
        msg.textContent = 'Provide username and password';
        msg.className = 'message error';
        return;
    }
    try {
        const res = await apiFetch('/api/admins/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + adminToken
            },
            body: JSON.stringify({ username: user, password: pwd })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to create admin');
        }
        const data = await res.json();
        msg.textContent = 'Admin account created successfully: ' + user;
        msg.className = 'message success';
        document.getElementById('newAdminUsername').value = '';
        document.getElementById('newAdminPassword').value = '';
        ownerLoadInstitutions();
    } catch (err) {
        console.error('Create admin error:', err);
        msg.textContent = err.message;
        msg.className = 'message error';
    }
}

function ownerLogout() {
    adminToken = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPassword').value = '';
    document.getElementById('loginMessage').textContent = '';
    document.getElementById('loginMessage').className = 'message';
    // after logging out of owner panel return to user login - nav will be shown if appropriate
    showSection('login');
}

function ownerSaveAdminCache(data) {
    try { localStorage.setItem('adminCache', JSON.stringify(data)); } catch {}
}
function ownerLoadAdminCache() {
    try { const v = localStorage.getItem('adminCache'); return v ? JSON.parse(v) : null; } catch { return null; }
}

async function ownerLoadInstitutions() {
    const loadingEl = document.getElementById('ownerLoadingMessage');
    if (loadingEl) loadingEl.style.display = 'block';

    const cached = ownerLoadAdminCache();
    if (cached) {
        ownerRenderInstitutions(cached);
    }

    try {
        const res = await apiFetch('/api/donors', {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (!res.ok) {
            console.warn('Failed to load donors, status:', res.status);
            if (res.status === 401) {
                console.warn('Unauthorized - your token may have expired');
            }
            return;
        }
        const donors = await res.json();
        ownerRenderInstitutions(donors);
        ownerSaveAdminCache(donors);
    } catch (err) {
        console.error('cannot load donors:', err);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function ownerRenderInstitutions(donors) {
    const instList = document.getElementById('ownerInstList');
    if (instList) instList.innerHTML = '';
    for (const inst in donors) {
        const row = document.createElement('div');
        row.className = 'inst-row';
        row.innerHTML = `<strong>${inst}</strong> (<span>${donors[inst].length}</span> donors)
                         <button type="button" class="btn-small btn-secondary" onclick="ownerDeleteInstitution('${inst}')">Delete</button>`;
        const donorContainer = document.createElement('div');
        donors[inst].forEach((d, idx) => {
            const dr = document.createElement('div');
            dr.className = 'donor-row';
            dr.innerHTML = `${d.name} (${d.bloodGroup}) - ${d.contact}
                            <button type="button" class="btn-small" onclick="ownerDeleteDonor('${inst}', ${idx})">x</button>`;
            donorContainer.appendChild(dr);
        });
        row.appendChild(donorContainer);
        instList.appendChild(row);
    }
}

async function ownerDeleteInstitution(inst) {
    if (!confirm(`Really delete institution "${inst}"?`)) return;
    try {
        const res = await apiFetch(`/api/institutions/${encodeURIComponent(inst)}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (!res.ok) {
            const err = await res.json();
            alert('Error deleting institution: ' + (err.error || 'Status ' + res.status));
            return;
        }
        await ownerLoadInstitutions();
    } catch (err) {
        console.error('deleteInstitution error:', err);
        alert('Failed to delete: ' + err.message);
    }
}

async function ownerDeleteDonor(inst, idx) {
    if (!confirm('Delete this donor?')) return;
    try {
        const res = await apiFetch(`/api/institutions/${encodeURIComponent(inst)}/donors/${idx}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (!res.ok) {
            const err = await res.json();
            alert('Error deleting donor: ' + (err.error || 'Status ' + res.status));
            return;
        }
        await ownerLoadInstitutions();
    } catch (err) {
        console.error('deleteDonor error:', err);
        alert('Failed to delete: ' + err.message);
    }
}

// initialization
(async function init() {
    initAuth();
    await loadDonors();
    // if not authenticated we'll be on login section
    if (authToken || manualMode) showSection('home');
})();