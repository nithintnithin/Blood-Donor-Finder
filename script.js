// authentication state
let authToken = null;
let isAdmin = false; // extracted from JWT or server response

// Data will now be stored on the backend; frontend fetches it via API
let donors = {};
let currentInstitution = null;
let currentFilter = 'All';
let searchQuery = '';

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

    // immediately treat user as signed in so navigation occurs
    authToken = 'manual';
    isAdmin = false;
    localStorage.setItem('authToken', authToken);
    showDashboard();

    // attempt to notify backend (optional); errors do not block UI
    try {
        const res = await fetch('/api/auth/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            authToken = data.token;
            isAdmin = !!data.isAdmin;
            localStorage.setItem('authToken', authToken);
        }
    } catch (err) {
        console.warn('backend auth failed, continuing offline');
    }
}

// check for existing token on page load
function initAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        // if looks like a JWT try decode, otherwise assume simple manual token
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
            isAdmin = false;
        }
        showDashboard();
    }
}

async function showDashboard() {
    // require at least a token (even dummy) to move forward
    if (!authToken) {
        alert('Unable to show dashboard: no authentication token');
        return;
    }
    // reveal navigation
    document.querySelector('nav').style.display = 'flex';
    if (isAdmin) document.getElementById('adminNav').style.display = 'inline-block';
    // hide login section and show home
    document.getElementById('login').style.display = 'none';
    document.getElementById('home').style.display = '';
    try { await loadDonors(); } catch {}
    if (isAdmin) { try { await loadInstitutions(); } catch {} }
    // bypass showSection guard by temporarily storing token
    showSection('home');
}

function logout() {
    authToken = null;
    isAdmin = false;
    localStorage.removeItem('authToken');
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
    if (!authToken && sectionId !== 'login') {
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
    } else if (sectionId === 'admin') {
        if (isAdmin) loadInstitutions();
        else {
            document.getElementById('adminStatusMsg').textContent = 'You are not authorized to view admin tools';
        }
    }
    // admin check occurred earlier when showing nav card
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

    // send to backend
    try {
        const res = await fetch('/api/donors', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authToken ? { Authorization: 'Bearer ' + authToken } : {}),
            body: JSON.stringify({ institution, name, age, bloodGroup, contact, address })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to register');
        }
        showMessage('registerMessage', 'Registered successfully!', 'success');
        this.reset();
        await loadDonors();
    } catch (err) {
        showMessage('registerMessage', err.message, 'error');
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
            if (isAdmin) {
                const delBtn = document.createElement('button');
                delBtn.textContent = '×';
                delBtn.className = 'btn-small btn-danger';
                delBtn.onclick = (e) => { e.stopPropagation(); deleteInstitution(institution); };
                instDiv.appendChild(delBtn);
            }
            
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
        if (isAdmin) {
            inner += `<button class="btn-small btn-danger" onclick="deleteDonor('${currentInstitution}', ${index})">Delete</button>`;
        }
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
                headers: Object.assign({ 'Content-Type': 'application/json' }, authToken ? { Authorization: 'Bearer ' + authToken } : {}),
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
            alert(err.message);
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
            headers: authToken ? { Authorization: 'Bearer ' + authToken } : {}
        });
        donors = await res.json();
    } catch (err) {
        console.error('Failed to load donors', err);
        donors = {};
    }
}

// ------------------------------------------------------------------
// Admin panel functionality

// reload the donors (same as regular user) and render admin‑specific controls
async function loadInstitutions() {
    try {
        const res = await fetch('/api/donors', {
            headers: authToken ? { Authorization: 'Bearer ' + authToken } : {}
        });
        const data = await res.json();
        renderInstitutions(data);
    } catch (err) {
        console.error('cannot load', err);
    }
}

// promote a user (by email or phone) to administrator
async function createAdmin() {
    const identifier = document.getElementById('newAdminEmail').value.trim();
    const msgDiv = document.getElementById('createAdminMessage');
    msgDiv.textContent = '';
    if (!identifier) {
        msgDiv.textContent = 'Provide an email or phone number';
        msgDiv.className = 'message error';
        return;
    }
    let payload = {};
    if (/^\+?[0-9]{6,15}$/.test(identifier)) {
        payload.phone = identifier;
    } else if (/\S+@\S+/.test(identifier)) {
        payload.email = identifier.toLowerCase();
    } else {
        msgDiv.textContent = 'Invalid email or phone format';
        msgDiv.className = 'message error';
        return;
    }
    try {
        const res = await fetch('/api/admins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        msgDiv.textContent = 'Admin account set';
        msgDiv.className = 'message success';
        document.getElementById('newAdminEmail').value = '';
    } catch (err) {
        msgDiv.textContent = err.message;
        msgDiv.className = 'message error';
    }
}

function renderInstitutions(donorsData) {
    const instList = document.getElementById('instList');
    instList.innerHTML = '';
    for (const inst in donorsData) {
        const row = document.createElement('div');
        row.className = 'inst-row';
        let html = `<strong>${inst}</strong> (<span>${donorsData[inst].length}</span> donors)`;
        if (isAdmin) {
            html += ` <button class="btn-small btn-secondary" onclick="deleteInstitution('${inst}')">Delete</button>`;
        }
        row.innerHTML = html;
        const donorContainer = document.createElement('div');
        donorsData[inst].forEach((d, idx) => {
            const dr = document.createElement('div');
            dr.className = 'donor-row';
            let donorHtml = `${d.name} (${d.bloodGroup}) - ${d.contact}`;
            if (isAdmin) {
                donorHtml += ` <button class="btn-small" onclick="deleteDonor('${inst}', ${idx})">x</button>`;
            }
            dr.innerHTML = donorHtml;
            donorContainer.appendChild(dr);
        });
        row.appendChild(donorContainer);
        instList.appendChild(row);
    }
}        const donorContainer = document.createElement('div');
        donorsData[inst].forEach((d, idx) => {
            const dr = document.createElement('div');
            dr.className = 'donor-row';
            dr.innerHTML = `${d.name} (${d.bloodGroup}) - ${d.contact}
                            <button class="btn-small" onclick="deleteDonor('${inst}', ${idx})">x</button>`;
            donorContainer.appendChild(dr);
        });
        row.appendChild(donorContainer);
        instList.appendChild(row);
    }
}

async function deleteInstitution(inst) {
    if (!confirm(`Really delete institution "${inst}"?`)) return;
    await fetch(`/api/institutions/${encodeURIComponent(inst)}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken }
    });
    loadInstitutions();
    await loadDonors();
    renderLists();
}

async function deleteDonor(inst, idx) {
    if (!confirm('Delete this donor?')) return;
    await fetch(`/api/institutions/${encodeURIComponent(inst)}/donors/${idx}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken }
    });
    loadInstitutions();
    await loadDonors();
    renderLists();
}

// ------------------------------------------------------------------

// initialization
(async function init() {
    initAuth();
    await loadDonors();
    // if not authenticated we'll be on login section
    if (authToken) showSection('home');
})();