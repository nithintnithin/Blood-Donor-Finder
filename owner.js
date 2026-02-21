let adminToken = null;

// called on page load to decide which section to show
async function checkAdminStatus() {
    try {
        const res = await fetch('/api/admins/status');
        if (!res.ok) throw new Error('status failed');
        const data = await res.json();
        // start with both hidden
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('firstAdminSection').style.display = 'none';
        if (data.exists) {
            // admins exist: show regular login form
            document.getElementById('loginSection').style.display = 'block';
        } else {
            // no admins yet: show account creation form
            document.getElementById('firstAdminSection').style.display = 'block';
        }
    } catch (err) {
        console.error('could not fetch admin status', err);
        // fallback to login form
        document.getElementById('firstAdminSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('loginMessage').textContent = 'Connection issue - please try again';
        document.getElementById('loginMessage').className = 'message';
    }
}

async function createFirstAdmin() {
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
        const res = await fetch('/api/first-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pwd })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Could not create');
        }
        // automatically log in with new credentials
        adminToken = null; // ensure cleared
        document.getElementById('firstAdminSection').style.display = 'none';
        document.getElementById('adminUsername').value = username;
        document.getElementById('adminPassword').value = pwd;
        await login();
    } catch (err) {
        msg.textContent = err.message;
        msg.className = 'message error';
    }
}

async function login() {
    // hide first-admin form if shown
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
        
        const res = await fetch('/api/login', {
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
        loadInstitutions();
    } catch (err) {
        msgEl.textContent = 'Error: ' + err.message;
        msgEl.className = 'message error';
    }
}

// create additional admin account using username/password
async function createAdminUser() {
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
        console.log('Creating admin with token:', adminToken ? 'exists' : 'missing');
        const res = await fetch('/api/admins/create', {
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
        // Reload institutions list after creating admin
        loadInstitutions();
    } catch (err) {
        console.error('Create admin error:', err);
        msg.textContent = err.message;
        msg.className = 'message error';
    }
}

function logout() {
    adminToken = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPassword').value = '';
    document.getElementById('loginMessage').textContent = '';
    document.getElementById('loginMessage').className = 'message';
}

async function loadInstitutions() {
    try {
        const res = await fetch('/api/donors');
        const donors = await res.json();
        renderInstitutions(donors);
    } catch (err) {
        console.error('cannot load', err);
    }
}

function renderInstitutions(donors) {
    const instList = document.getElementById('instList');
    instList.innerHTML = '';
    for (const inst in donors) {
        const row = document.createElement('div');
        row.className = 'inst-row';
        row.innerHTML = `<strong>${inst}</strong> (<span>${donors[inst].length}</span> donors)
                         <button class="btn-small btn-secondary" onclick="deleteInstitution('${inst}')">Delete</button>`;
        const donorContainer = document.createElement('div');
        donors[inst].forEach((d, idx) => {
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
        headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    loadInstitutions();
}

async function deleteDonor(inst, idx) {
    if (!confirm('Delete this donor?')) return;
    await fetch(`/api/institutions/${encodeURIComponent(inst)}/donors/${idx}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    loadInstitutions();
}

// kick off initial status check when script loads
checkAdminStatus();
