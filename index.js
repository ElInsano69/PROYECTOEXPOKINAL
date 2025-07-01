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

// Función renderAvatar mejorada para reutilización
function renderAvatar(containerElement, nombre, apellido, foto, size, className, clickHandler = null) {
    if (!containerElement) {
        console.warn(`Contenedor '${containerElement}' no encontrado.`);
        return;
    }
    containerElement.innerHTML = '';
    
    let element;
    if (foto) {
        element = document.createElement('img');
        element.src = foto;
        element.alt = 'Foto de perfil';
        element.className = className + ' user-photo'; // Siempre user-photo si es img
    } else {
        element = document.createElement('div');
        element.className = className + ' user-circle'; // Siempre user-circle si es iniciales
        element.textContent = getInitials(nombre, apellido);
    }
    
    element.style.width = element.style.height = size + 'px';
    if (clickHandler) element.onclick = clickHandler;
    
    containerElement.appendChild(element);
}

// Modificación de showUserAvatar para usar la nueva renderAvatar
function showUserAvatar() {
    const nombre = localStorage.getItem('nombre_actual') || '';
    const apellido = localStorage.getItem('apellido_actual') || '';
    const foto = localStorage.getItem('foto_actual') || ''; 
    const userAvatarContainer = document.getElementById('user-avatar-container');

    if (localStorage.getItem('correo_actual') !== 'invitado@temp.com') {
        renderAvatar(userAvatarContainer, nombre, apellido, foto, window.innerWidth < 600 ? 36 : 44, 'user-circle-header', showPerfilModal);
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
    const foto = localStorage.getItem('foto_actual') || '';
    const perfilAvatarContainer = document.getElementById('perfil-avatar-container');

    renderAvatar(perfilAvatarContainer, nombre, apellido, foto, window.innerWidth < 600 ? 44 : 60, 'user-circle-modal');
    
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

    tbody.innerHTML = '<tr><td colspan="7">Cargando usuarios...</td></tr>'; 
    try {
        const token = localStorage.getItem('token');
        const userRole = localStorage.getItem('rol_actual');
        
        if (!token || userRole !== 'admin') {
            tbody.innerHTML = '<tr><td colspan="7">Acceso denegado. No tienes permisos de administrador.</td></tr>';
            return;
        }

        const response = await fetch(`${API_BASE_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (response.status === 403) {
                tbody.innerHTML = '<tr><td colspan="7">Acceso denegado. No tienes permisos de administrador.</td></tr>';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const usuarios = await response.json();
        tbody.innerHTML = ''; 

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No hay usuarios registrados.</td></tr>';
        } else {
            usuarios.forEach(usuario => {
                const tr = document.createElement('tr');
                // Asegúrate de que el administrador actual no tenga el botón de eliminar
                const currentUserObj = JSON.parse(localStorage.getItem('user'));
                const isCurrentUserAdmin = (currentUserObj && currentUserObj.id === usuario.id && usuario.rol === 'admin');

                const fotoHtmlContainer = document.createElement('td');
                fotoHtmlContainer.style.textAlign = 'center'; 
                renderAvatar(fotoHtmlContainer, usuario.nombre, usuario.apellido, usuario.foto, 30, 'user-table');


                tr.innerHTML = `<td>${usuario.id}</td>
                                <td>${usuario.correo}</td>
                                <td>${usuario.nombre || 'N/A'}</td>
                                <td>${usuario.apellido || 'N/A'}</td>
                                <td>${usuario.rol || 'N/A'}</td>
                                <td>
                                    ${!isCurrentUserAdmin ? `<button class="delete-user-btn" onclick="deleteUser(${usuario.id})">Eliminar</button>` : ''}
                                </td>`; 
                
                // Añadir la celda de la foto
                tr.appendChild(fotoHtmlContainer);
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error al cargar usuarios desde el backend:', error);
        tbody.innerHTML = '<tr><td colspan="7">Error al cargar usuarios. Intenta de nuevo más tarde.</td></tr>';
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
    closePerfilModal(); 
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const registerSuccess = document.getElementById('register-success');
    const perfilFotoInput = document.getElementById('perfil-foto-input');
    const guestLoginBtn = document.getElementById('guest-login-btn');
    const guestLoginBtnRegister = document.getElementById('guest-login-btn-register');


    document.getElementById('show-register').onclick = function() {
        loginForm.style.display = 'none';
        registerForm.style.display = '';
        loginError.textContent = '';
        registerSuccess.textContent = '';
        registerError.textContent = '';
    };
    document.getElementById('show-login').onclick = function() {
        registerForm.style.display = 'none';
        loginForm.style.display = '';
        registerError.textContent = '';
        registerSuccess.textContent = '';
        loginError.textContent = '';
    };

    updateUI();


    // *** LOGICA DE LOGIN CON BACKEND ***
    if (loginForm) { 
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const correo = loginForm.email.value.trim();
            const password = loginForm.clave.value.trim();

            loginError.textContent = ''; 

            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ correo: correo, password: password })
                });

                const data = await response.json();

                if (response.ok) { 
                    localStorage.setItem('logueado', 'si');
                    localStorage.setItem('correo_actual', data.user.correo);
                    localStorage.setItem('nombre_actual', data.user.nombre || data.user.correo.split('@')[0]);
                    localStorage.setItem('apellido_actual', data.user.apellido || '');
                    localStorage.setItem('foto_actual', data.user.foto || ''); // Guardar la foto
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('rol_actual', data.user.rol);

                    loginForm.reset();
                    mostrarBienvenida(data.user.nombre || data.user.correo.split('@')[0]); 
                    setTimeout(() => {
                        updateUI(); 
                    }, 1200);
                    
                } else { 
                    loginError.textContent = data.message || 'Credenciales incorrectas. Inténtalo de nuevo.';
                }
            } catch (error) {
                console.error('Error de conexión con el servidor para login:', error);
                loginError.textContent = 'No se pudo conectar al servidor. Asegúrate de que el servidor Node.js esté corriendo.';
            }
        });
    }

    // *** LOGICA DE REGISTRO CON BACKEND ***
    if (registerForm) { 
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const nombre = registerForm.nombre.value.trim();
            const apellido = registerForm.apellido.value.trim();
            const correo = registerForm.email.value.trim();
            const password = registerForm.clave.value.trim();
            const clave2 = registerForm.clave2.value.trim();
            
            let fotoBase64 = ''; // Al registrar, la foto puede estar vacía inicialmente
            
            registerError.textContent = ''; 
            registerSuccess.textContent = ''; 

            if (!nombre || !apellido || !correo || !password || !clave2) {
                registerError.textContent = "Completa todos los campos obligatorios.";
                return;
            }
            if (password.length < 6) {
                registerError.textContent = "La contraseña debe tener al menos 6 caracteres.";
                return;
            }
            if (password !== clave2) {
                registerError.textContent = "Las contraseñas no coinciden.";
                return;
            }
            if (!/\S+@\S+\.\S+/.test(correo)) {
                registerError.textContent = "Por favor, ingresa un formato de correo válido.";
                return;
            }

            const processRegistration = async () => {
                const userData = { 
                    nombre: nombre,
                    apellido: apellido,
                    correo: correo,
                    password: password,
                    foto: fotoBase64, // Pasa la foto (vacía al registrarse)
                    rol: 'estudiante'
                };

                try {
                    const response = await fetch(`${API_BASE_URL}/register`, { 
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(userData)
                    });

                    const data = await response.json();

                    if (response.ok) { 
                        localStorage.setItem('logueado', 'si');
                        localStorage.setItem('correo_actual', data.user.correo);
                        localStorage.setItem('nombre_actual', data.user.nombre || data.user.correo.split('@')[0]);
                        localStorage.setItem('apellido_actual', data.user.apellido || '');
                        localStorage.setItem('foto_actual', data.user.foto || ''); // Guardar la foto
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('user', JSON.stringify(data.user));
                        localStorage.setItem('rol_actual', data.user.rol);

                        registerForm.reset();
                        mostrarBienvenida(data.user.nombre || data.user.correo.split('@')[0]);
                        setTimeout(() => {
                            updateUI();
                        }, 1200);
                    } else { 
                        registerError.textContent = data.message || 'Error en el registro. Intenta con otro correo.';
                    }
                } catch (error) {
                    console.error('Error de conexión con el servidor para registro:', error);
                    registerError.textContent = 'No se pudo conectar al servidor. Asegúrate de que el servidor Node.js esté corriendo.';
                }
            };

            processRegistration(); 
        });
    }

    // Lógica para actualizar foto de perfil
    if (perfilFotoInput) { 
        perfilFotoInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                // Comprimir o redimensionar la imagen si es muy grande antes de convertir a Base64
                const MAX_WIDTH = 200; // Por ejemplo, un ancho máximo para la foto de perfil
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = new Image();
                    img.onload = async function() {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        const fotoBase64 = canvas.toDataURL('image/jpeg', 0.8); // Calidad 0.8

                        const userString = localStorage.getItem('user');
                        if (!userString) {
                            alert('No hay usuario logueado para actualizar la foto.');
                            return;
                        }
                        const userId = JSON.parse(userString).id;
                        const token = localStorage.getItem('token');
                        const nombre = localStorage.getItem('nombre_actual');
                        const apellido = localStorage.getItem('apellido_actual');
                        const correo = localStorage.getItem('correo_actual');

                        try {
                            const response = await fetch(`${API_BASE_URL}/profile`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ nombre, apellido, correo, foto: fotoBase64 })
                            });

                            if (response.ok) {
                                const data = await response.json();
                                localStorage.setItem('foto_actual', data.user.foto); // Asegúrate de guardar la nueva foto
                                localStorage.setItem('user', JSON.stringify(data.user)); // Actualiza user completo
                                showUserAvatar(); 
                                showPerfilModal(); 
                                alert('Foto de perfil actualizada con éxito.');
                            } else {
                                const errorData = await response.json();
                                alert('Error al actualizar la foto de perfil: ' + (errorData.message || 'Desconocido'));
                            }
                        } catch (error) {
                            console.error('Error al subir la foto de perfil:', error);
                            alert('No se pudo conectar al servidor para actualizar la foto.');
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // *** LOGICA DE "SEGUIR SIN CUENTA" ***
    function handleGuestLogin() {
        localStorage.setItem('logueado', 'si');
        localStorage.setItem('correo_actual', 'invitado@temp.com'); 
        localStorage.setItem('nombre_actual', 'Invitado');
        localStorage.setItem('apellido_actual', '');
        localStorage.removeItem('foto_actual'); // Asegurarse de que no haya foto para invitados
        localStorage.removeItem('token'); 
        localStorage.removeItem('user'); 
        localStorage.setItem('rol_actual', 'invitado');

        mostrarBienvenida('Invitado'); 
        setTimeout(() => {
            updateUI(); 
        }, 1200); 
    }

    if (guestLoginBtn) guestLoginBtn.addEventListener('click', handleGuestLogin);
    if (guestLoginBtnRegister) guestLoginBtnRegister.addEventListener('click', handleGuestLogin);
});