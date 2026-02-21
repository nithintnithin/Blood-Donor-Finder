// authentication state
let authToken = null;
// admin role is handled in separate owner/admin panel; index page treats all users the same
let manualMode = false; // true when user signed in with name+phone without a valid JWT

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
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: response.credential })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed');
        authToken = data.token;
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
        const res = await fetch('/api/auth/manual', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name, phone })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            authToken = data.token;
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
                // payload may include isAdmin but index page ignores it
                JSON.parse(atob(token.split('.')[1]));
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
    if (!authToken && !manualMode && sectionId !== 'login') {
        alert('You must sign in first');
        return;
    }
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
    
    // render dynamic areas when they become visible
    if (sectionId === 'lists') {
        renderLists();
    } else if (sectionId === 'institutionDetails') {
        renderInstitutionDetails();
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
        const res = await fetch('/api/donors', {
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
            const res = await fetch('/api/institutions', {
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
        const res = await fetch('/api/donors', {
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


// initialization
(async function init() {
    initAuth();
    await loadDonors();
    // if not authenticated we'll be on login section
    if (authToken || manualMode) showSection('home');
})();