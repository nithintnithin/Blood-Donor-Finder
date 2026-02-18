let adminToken = null;

async function login() {
    const username = document.getElementById('adminUsername').value;
    const pwd = document.getElementById('adminPassword').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pwd })
        });
        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();
        adminToken = data.token;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadInstitutions();
    } catch (err) {
        document.getElementById('loginMessage').textContent = err.message;
        document.getElementById('loginMessage').className = 'message error';
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
