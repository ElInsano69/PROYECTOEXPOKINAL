// --- Menú lateral ---
function toggleMenu() {
    const menu = document.getElementById('menu-list');
    menu.classList.toggle('show');
}
document.addEventListener('click', function(e) {
    const menu = document.getElementById('menu-list');
    const icon = document.querySelector('.menu-icon');
    if (e.target.closest('.menu-list a')) return;
    if (!menu.contains(e.target) && !icon.contains(e.target)) {
        menu.classList.remove('show');
    }
});
document.addEventListener('DOMContentLoaded', function() {
    const menu = document.getElementById('menu-list');
    const links = menu.querySelectorAll('a');
    function updateLinks() {
        if (menu.classList.contains('show')) {
            links.forEach(a => a.tabIndex = 0);
        } else {
            links.forEach(a => a.tabIndex = -1);
        }
    }
    updateLinks();
    const observer = new MutationObserver(updateLinks);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
});

// Utilidades
function getInitials(nombre, apellido) {
    if (!nombre && !apellido) return "?";
    let initials = "";
    if (nombre) initials += nombre[0];
    if (apellido) initials += apellido[0];
    return initials.toUpperCase();
}

// Función renderAvatar mejorada para reutilización (simplificada sin 'foto')
function renderAvatar(containerElement, nombre, apellido, size, className, clickHandler = null) {
    if (!containerElement) {
        console.warn(`Contenedor '${containerElement}' no encontrado.`);
        return;
    }
    containerElement.innerHTML = '';
    
    let element = document.createElement('div');
    element.className = className + ' user-circle'; // Siempre user-circle
    element.textContent = getInitials(nombre, apellido);
    
    element.style.width = element.style.height = size + 'px';
    if (clickHandler) element.onclick = clickHandler;
    
    containerElement.appendChild(element);
}

// Modificación de showUserAvatar para usar la nueva renderAvatar (sin 'foto')
function showUserAvatar() {
    const nombre = localStorage.getItem('nombre_actual') || '';
    const apellido = localStorage.getItem('apellido_actual') || '';
    const userAvatarContainer = document.getElementById('user-avatar-container');

    if (localStorage.getItem('correo_actual') !== 'invitado@temp.com') {
        renderAvatar(userAvatarContainer, nombre, apellido, window.innerWidth < 600 ? 36 : 44, 'user-circle-header', showPerfilModal);
    } else {
        if (userAvatarContainer) userAvatarContainer.innerHTML = '';
    }
}

function showPerfilModal() {
    if (localStorage.getItem('correo_actual') === 'invitado@temp.com') {
        return;
    }
    const correo = localStorage.getItem('correo_actual') || '';
    const nombre = localStorage.getItem('nombre_actual') || '';
    const apellido = localStorage.getItem('apellido_actual') || '';
    const perfilAvatarContainer = document.getElementById('perfil-avatar-container');

    renderAvatar(perfilAvatarContainer, nombre, apellido, window.innerWidth < 600 ? 44 : 60, 'user-circle-modal');
    
    document.getElementById('perfil-nombre').textContent = "Nombre: " + (nombre || 'N/A');
    document.getElementById('perfil-apellido').textContent = "Apellido: " + (apellido || 'N/A');
    document.getElementById('perfil-usuario').textContent = "Correo: " + correo;
    document.getElementById('perfil-modal-bg').classList.add('show');
}
function closePerfilModal() {
    const modal = document.getElementById('perfil-modal-bg');
    if (modal) modal.classList.remove('show');
}

function mostrarBienvenida(nombre) {
    const msg = document.getElementById('bienvenido-full');
    if (!msg) return;
    msg.innerHTML = `<span class="bienvenido-text">BIENVENIDO ${nombre}</span>`;
    msg.classList.add('show');
    setTimeout(() => {
        msg.classList.remove('show');
    }, 2500);
}

// *** FUNCIONES QUE INTERACTÚAN CON EL BACKEND ***

const API_BASE_URL = 'https://proyectoexpokinal.onrender.com';

// Nueva función para eliminar usuario
async function deleteUser(userId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
        return;
    }

    const token = localStorage.getItem('token');
    const currentUserEmail = localStorage.getItem('correo_actual');
    const currentUserRole = localStorage.getItem('rol_actual');

    if (!token || currentUserEmail !== 'admin@admin.com' || currentUserRole !== 'admin') {
        alert('No tienes permisos para eliminar usuarios.');
        return;
    }

    // Evitar que el administrador se elimine a sí mismo
    const currentUserObj = JSON.parse(localStorage.getItem('user'));
    if (currentUserObj && currentUserObj.id === userId) {
        alert('No puedes eliminar tu propia cuenta de administrador.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            alert('Usuario eliminado con éxito.');
            cargarUsuariosDesdeBackend(); // Recargar la tabla después de eliminar
        } else {
            const errorData = await response.json();
            alert('Error al eliminar usuario: ' + (errorData.message || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error al conectar con el servidor para eliminar usuario:', error);
        alert('Error de conexión al intentar eliminar usuario.');
    }
}


async function cargarUsuariosDesdeBackend() {
    const tbody = document.querySelector('#usuarios-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Cargando usuarios...</td></tr>'; // Actualizado a 6 columnas
    try {
        const token = localStorage.getItem('token');
        const userRole = localStorage.getItem('rol_actual');
        
        if (!token || userRole !== 'admin') {
            tbody.innerHTML = '<tr><td colspan="6">Acceso denegado. No tienes permisos de administrador.</td></tr>';
            return;
        }

        const response = await fetch(`${API_BASE_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (response.status === 403) {
                tbody.innerHTML = '<tr><td colspan="6">Acceso denegado. No tienes permisos de administrador.</td></tr>';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const usuarios = await response.json();
        tbody.innerHTML = '';

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
        } else {
            usuarios.forEach(usuario => {
                const tr = document.createElement('tr');
                const currentUserObj = JSON.parse(localStorage.getItem('user'));
                const isCurrentUserAdmin = (currentUserObj && currentUserObj.id === usuario.id && usuario.rol === 'admin');

                tr.innerHTML = `<td>${usuario.id}</td>
                                <td>${usuario.correo}</td>
                                <td>${usuario.nombre || 'N/A'}</td>
                                <td>${usuario.apellido || 'N/A'}</td>
                                <td>${usuario.rol || 'N/A'}</td>
                                <td>
                                    ${!isCurrentUserAdmin ? `<button class="delete-user-btn" onclick="deleteUser(${usuario.id})">Eliminar</button>` : ''}
                                </td>`;
                
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error al cargar usuarios desde el backend:', error);
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar usuarios. Intenta de nuevo más tarde.</td></tr>';
    }
}

function updateUI() {
    const accesoSection = document.getElementById('acceso-section');
    const mainSection = document.getElementById('main-section');
    const sidebarSection = document.getElementById('sidebar-section');
    const userAvatarContainer = document.getElementById('user-avatar-container');
    const usuariosSection = document.getElementById('usuarios-section');
    const adminDashboardLink = document.getElementById('admin-dashboard-link');

    if (!accesoSection || !mainSection || !sidebarSection || !userAvatarContainer || !usuariosSection || !adminDashboardLink) {
        console.error("Algunos elementos UI no se encontraron. La interfaz no se actualizará completamente.");
        return;
    }

    const isUserLoggedIn = localStorage.getItem('logueado') === 'si';
    const currentUserEmail = localStorage.getItem('correo_actual');
    const currentUserRole = localStorage.getItem('rol_actual');

    if (isUserLoggedIn) {
        accesoSection.style.display = 'none';
        sidebarSection.style.display = '';
        showUserAvatar();

        mainSection.style.display = '';
        usuariosSection.style.display = 'none';

        if (currentUserEmail === 'admin@admin.com' && currentUserRole === 'admin') {
            adminDashboardLink.style.display = '';
            adminDashboardLink.onclick = async function(e) {
                e.preventDefault();
                mainSection.style.display = 'none';
                usuariosSection.style.display = '';
                await cargarUsuariosDesdeBackend();
                toggleMenu();
            };
        } else {
            adminDashboardLink.style.display = 'none';
        }

    } else {
        accesoSection.style.display = '';
        mainSection.style.display = 'none';
        sidebarSection.style.display = 'none';
        userAvatarContainer.innerHTML = '';
        usuariosSection.style.display = 'none';
        adminDashboardLink.style.display = 'none';
        closePerfilModal();
    }
}


// --- Función para cerrar sesión ---
function logout() {
    localStorage.clear();
    
    const menu = document.getElementById('menu-list');
    if (menu) menu.classList.remove('show');
    
    updateUI();
}

// --- Manejo de Login/Registro ---
document.getElementById('show-register').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-error').textContent = '';
});

document.getElementById('show-login').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('register-error').textContent = '';
    document.getElementById('register-success').textContent = '';
});

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = this.elements.email.value;
    const clave = this.elements.clave.value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = '';

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, clave })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('logueado', 'si');
            localStorage.setItem('correo_actual', data.user.correo);
            localStorage.setItem('nombre_actual', data.user.nombre);
            localStorage.setItem('apellido_actual', data.user.apellido);
            localStorage.setItem('rol_actual', data.user.rol);
            localStorage.setItem('user', JSON.stringify(data.user)); // Guarda todo el objeto user

            mostrarBienvenida(data.user.nombre);
            setTimeout(() => {
                updateUI();
            }, 2500); // Espera a que termine la animación
        } else {
            errorDiv.textContent = data.message || 'Error en el login';
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        errorDiv.textContent = 'Error de conexión con el servidor.';
    }
});

document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nombre = this.elements.nombre.value;
    const apellido = this.elements.apellido.value;
    const email = this.elements.email.value;
    const clave = this.elements.clave.value;
    const clave2 = this.elements.clave2.value;
    const errorDiv = document.getElementById('register-error');
    const successDiv = document.getElementById('register-success');
    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (clave !== clave2) {
        errorDiv.textContent = 'Las contraseñas no coinciden.';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nombre, apellido, email, clave })
        });

        const data = await response.json();
        if (response.ok) {
            successDiv.textContent = '¡Registro exitoso! Ahora puedes iniciar sesión.';
            this.reset();
            setTimeout(() => {
                document.getElementById('show-login').click();
            }, 2000);
        } else {
            errorDiv.textContent = data.message || 'Error en el registro';
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        errorDiv.textContent = 'Error de conexión con el servidor.';
    }
});

// Listener para el botón "Seguir sin cuenta" del formulario de login
document.getElementById('guest-login-btn').addEventListener('click', function() {
    localStorage.setItem('logueado', 'si');
    localStorage.setItem('correo_actual', 'invitado@temp.com');
    localStorage.setItem('nombre_actual', 'Invitado');
    localStorage.setItem('apellido_actual', '');
    localStorage.setItem('rol_actual', 'invitado');
    localStorage.removeItem('token'); // Asegurarse de que no haya token para invitados
    localStorage.removeItem('user'); // Limpiar objeto user para invitados

    mostrarBienvenida('Invitado');
    setTimeout(() => {
        updateUI();
    }, 2500);
});

// Listener para el botón "Seguir sin cuenta" del formulario de registro
document.getElementById('guest-login-btn-register').addEventListener('click', function() {
    localStorage.setItem('logueado', 'si');
    localStorage.setItem('correo_actual', 'invitado@temp.com');
    localStorage.setItem('nombre_actual', 'Invitado');
    localStorage.setItem('apellido_actual', '');
    localStorage.setItem('rol_actual', 'invitado');
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    mostrarBienvenida('Invitado');
    setTimeout(() => {
        updateUI();
    }, 2500);
});

// Carga inicial y listeners
document.addEventListener('DOMContentLoaded', updateUI);
window.addEventListener('resize', showUserAvatar);

// Cierra el modal de perfil si se hace clic fuera de él
document.getElementById('perfil-modal-bg').addEventListener('click', function(e) {
    if (e.target === this) {
        closePerfilModal();
    }
});