// --- Menú lateral ---
function toggleMenu() {
    const menu = document.getElementById('menu-list');
    menu.classList.toggle('show');
}
document.addEventListener('click', function(e) {
    const menu = document.getElementById('menu-list');
    const icon = document.querySelector('.menu-icon');
    // Si el clic es dentro de un enlace del menú, no lo cierres
    if (e.target.closest('.menu-list a')) return;
    // Si el clic no es en el menú ni en el ícono, cierra el menú
    if (!menu.contains(e.target) && !icon.contains(e.target)) {
        menu.classList.remove('show');
    }
});
document.addEventListener('DOMContentLoaded', function() {
    const menu = document.getElementById('menu-list');
    const links = menu.querySelectorAll('a');
    function updateLinks() {
        if (menu.classList.contains('show')) {
            links.forEach(a => a.tabIndex = 0); // Habilita tabulación para accesibilidad
        } else {
            links.forEach(a => a.tabIndex = -1); // Deshabilita tabulación
        }
    }
    updateLinks();
    // Observa cambios en la clase 'show' del menú para actualizar la accesibilidad
    const observer = new MutationObserver(updateLinks);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
});

// --- Utilidades ---
function getInitials(nombre, apellido) {
    if (!nombre && !apellido) return "?";
    let initials = "";
    if (nombre) initials += nombre[0];
    if (apellido) initials += apellido[0];
    return initials.toUpperCase();
}

// Función renderAvatar mejorada para reutilización
function renderAvatar(containerElement, nombre, apellido, size, className, clickHandler = null) {
    if (!containerElement) {
        console.warn(`Contenedor '${containerElement}' no encontrado para el avatar.`);
        return;
    }
    containerElement.innerHTML = ''; // Limpia el contenedor
    
    let element = document.createElement('div');
    element.className = className + ' user-circle'; // Clases CSS para el estilo del círculo
    element.textContent = getInitials(nombre, apellido); // Muestra iniciales
    
    element.style.width = element.style.height = size + 'px'; // Establece tamaño
    if (clickHandler) element.onclick = clickHandler; // Asigna click handler si existe
    
    containerElement.appendChild(element); // Agrega el avatar al DOM
}

// Muestra el avatar del usuario en el encabezado
function showUserAvatar() {
    const nombre = localStorage.getItem('nombre_actual') || '';
    const apellido = localStorage.getItem('apellido_actual') || '';
    const userAvatarContainer = document.getElementById('user-avatar-container');

    if (localStorage.getItem('correo_actual') !== 'invitado@temp.com') {
        renderAvatar(userAvatarContainer, nombre, apellido, window.innerWidth < 600 ? 36 : 44, 'user-circle-header', showPerfilModal);
    } else {
        if (userAvatarContainer) userAvatarContainer.innerHTML = ''; // Limpia si es invitado
    }
}

// Muestra el modal de perfil del usuario
function showPerfilModal() {
    if (localStorage.getItem('correo_actual') === 'invitado@temp.com') {
        return; // No muestra modal para invitados
    }
    const correo = localStorage.getItem('correo_actual') || '';
    const nombre = localStorage.getItem('nombre_actual') || '';
    const apellido = localStorage.getItem('apellido_actual') || '';
    const perfilAvatarContainer = document.getElementById('perfil-avatar-container');

    renderAvatar(perfilAvatarContainer, nombre, apellido, window.innerWidth < 600 ? 44 : 60, 'user-circle-modal');
    
    document.getElementById('perfil-nombre').textContent = "Nombre: " + (nombre || 'N/A');
    document.getElementById('perfil-apellido').textContent = "Apellido: " + (apellido || 'N/A');
    document.getElementById('perfil-usuario').textContent = "Correo: " + correo;
    document.getElementById('perfil-modal-bg').classList.add('show'); // Muestra el modal
}
// Cierra el modal de perfil
function closePerfilModal() {
    const modal = document.getElementById('perfil-modal-bg');
    if (modal) modal.classList.remove('show');
}

// Muestra el mensaje de bienvenida animado
function mostrarBienvenida(nombre) {
    const msg = document.getElementById('bienvenido-full');
    if (!msg) return;
    msg.innerHTML = `<span class="bienvenido-text">BIENVENIDO ${nombre}</span>`;
    msg.classList.add('show');
    setTimeout(() => {
        msg.classList.remove('show');
    }, 2500); // Duración de la animación
}

// --- FUNCIONES QUE INTERACTÚAN CON EL BACKEND (a través de fetch) ---

// Define la URL base de tu API.
// Cuando lo despliegues en Render, esta URL DEBERÍA APUNTAR A TU PROPIO SERVICIO DE RENDER.
// Por ahora, lo mantenemos como lo tenías, pero es importante que entiendas que
// tu frontend ahora hablará con el backend que acabamos de configurar en index.js.
const API_BASE_URL = 'https://proyectoexpokinal.onrender.com/api'; // Añadí /api porque tus rutas backend empiezan con /api

// Función para eliminar un usuario (llamada desde la tabla de admin)
async function deleteUser(userId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
        return;
    }

    const token = localStorage.getItem('token');
    const currentUserEmail = localStorage.getItem('correo_actual');
    const currentUserRole = localStorage.getItem('rol_actual');

    // Validación de permisos antes de hacer la petición
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
                'Authorization': `Bearer ${token}` // Envía el token para autenticación en el backend
            }
        });

        if (response.ok) {
            alert('Usuario eliminado con éxito.');
            cargarUsuariosDesdeBackend(); // Recarga la tabla de usuarios después de eliminar
        } else {
            const errorData = await response.json();
            alert('Error al eliminar usuario: ' + (errorData.message || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error al conectar con el servidor para eliminar usuario:', error);
        alert('Error de conexión al intentar eliminar usuario.');
    }
}

// Función para cargar y mostrar usuarios desde el backend (para la vista de administrador)
async function cargarUsuariosDesdeBackend() {
    const tbody = document.querySelector('#usuarios-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Cargando usuarios...</td></tr>'; // Mensaje de carga
    try {
        const token = localStorage.getItem('token');
        const userRole = localStorage.getItem('rol_actual');
        
        // Validación de permisos
        if (!token || userRole !== 'admin') {
            tbody.innerHTML = '<tr><td colspan="6">Acceso denegado. No tienes permisos de administrador.</td></tr>';
            return;
        }

        const response = await fetch(`${API_BASE_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${token}` // Envía el token
            }
        });
        if (!response.ok) {
            if (response.status === 403) {
                tbody.innerHTML = '<tr><td colspan="6">Acceso denegado. No tienes permisos de administrador.</td></tr>';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const usuarios = await response.json(); // Parsea la respuesta JSON
        tbody.innerHTML = ''; // Limpia el cuerpo de la tabla

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
        } else {
            // Itera sobre los usuarios y los añade a la tabla
            usuarios.forEach(usuario => {
                const tr = document.createElement('tr');
                const currentUserObj = JSON.parse(localStorage.getItem('user'));
                // Verifica si el usuario actual es el administrador que está logueado
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

// --- Lógica para actualizar la Interfaz de Usuario (UI) según el estado de sesión ---
function updateUI() {
    const accesoSection = document.getElementById('acceso-section');
    const mainSection = document.getElementById('main-section');
    const sidebarSection = document.getElementById('sidebar-section');
    const userAvatarContainer = document.getElementById('user-avatar-container');
    const usuariosSection = document.getElementById('usuarios-section');
    const adminDashboardLink = document.getElementById('admin-dashboard-link');

    // Verifica que todos los elementos necesarios existan en el DOM
    if (!accesoSection || !mainSection || !sidebarSection || !userAvatarContainer || !usuariosSection || !adminDashboardLink) {
        console.error("Algunos elementos UI no se encontraron. La interfaz no se actualizará completamente.");
        return;
    }

    const isUserLoggedIn = localStorage.getItem('logueado') === 'si';
    const currentUserEmail = localStorage.getItem('correo_actual');
    const currentUserRole = localStorage.getItem('rol_actual');

    if (isUserLoggedIn) {
        accesoSection.style.display = 'none'; // Oculta sección de login/registro
        sidebarSection.style.display = ''; // Muestra el menú lateral
        showUserAvatar(); // Muestra el avatar del usuario

        mainSection.style.display = ''; // Muestra la sección principal del contenido
        usuariosSection.style.display = 'none'; // Oculta la sección de usuarios (admin) por defecto

        // Muestra el enlace al Dashboard de Administrador solo si el usuario es admin
        if (currentUserEmail === 'admin@admin.com' && currentUserRole === 'admin') {
            adminDashboardLink.style.display = '';
            // Asigna un manejador de clic para cargar usuarios y mostrar la sección de admin
            adminDashboardLink.onclick = async function(e) {
                e.preventDefault();
                mainSection.style.display = 'none'; // Oculta la sección principal
                usuariosSection.style.display = ''; // Muestra la sección de usuarios (admin)
                await cargarUsuariosDesdeBackend(); // Carga los datos de los usuarios
                toggleMenu(); // Cierra el menú lateral si está abierto
            };
        } else {
            adminDashboardLink.style.display = 'none'; // Oculta si no es admin
        }

    } else { // Si el usuario no está logueado
        accesoSection.style.display = ''; // Muestra sección de login/registro
        mainSection.style.display = 'none'; // Oculta la sección principal
        sidebarSection.style.display = 'none'; // Oculta el menú lateral
        userAvatarContainer.innerHTML = ''; // Limpia el avatar
        usuariosSection.style.display = 'none'; // Oculta la sección de usuarios
        adminDashboardLink.style.display = 'none'; // Oculta el enlace de admin
        closePerfilModal(); // Cierra cualquier modal de perfil abierto
    }
}


// --- Función para cerrar sesión ---
function logout() {
    localStorage.clear(); // Limpia todos los datos de sesión en localStorage
    
    const menu = document.getElementById('menu-list');
    if (menu) menu.classList.remove('show'); // Cierra el menú si está abierto
    
    updateUI(); // Actualiza la interfaz para reflejar el estado de "no logueado"
}

// --- Manejo de Formularios de Login/Registro ---

// Muestra el formulario de registro y oculta el de login
document.getElementById('show-register').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-error').textContent = ''; // Limpia mensajes de error
});

// Muestra el formulario de login y oculta el de registro
document.getElementById('show-login').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('register-error').textContent = ''; // Limpia mensajes de error
    document.getElementById('register-success').textContent = ''; // Limpia mensajes de éxito
});

// Manejo del envío del formulario de Login
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault(); // Evita el envío tradicional del formulario
    const email = this.elements.email.value;
    const clave = this.elements.clave.value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = ''; // Limpia mensajes de error

    try {
        const response = await fetch(`${API_BASE_URL}/login`, { // Llama a la API de login en tu backend
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, clave })
        });

        const data = await response.json(); // Parsea la respuesta JSON del backend
        if (response.ok) { // Si la respuesta es exitosa (código 2xx)
            // Guarda los datos del usuario en localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('logueado', 'si');
            localStorage.setItem('correo_actual', data.user.correo);
            localStorage.setItem('nombre_actual', data.user.nombre);
            localStorage.setItem('apellido_actual', data.user.apellido);
            localStorage.setItem('rol_actual', data.user.rol);
            localStorage.setItem('user', JSON.stringify(data.user)); // Guarda el objeto completo del user

            mostrarBienvenida(data.user.nombre); // Muestra mensaje de bienvenida
            setTimeout(() => {
                updateUI(); // Actualiza la UI después de la animación de bienvenida
            }, 2500); 
        } else {
            errorDiv.textContent = data.message || 'Error en el login'; // Muestra mensaje de error del backend
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        errorDiv.textContent = 'Error de conexión con el servidor.'; // Error de red
    }
});

// Manejo del envío del formulario de Registro
document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault(); // Evita el envío tradicional
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
        const response = await fetch(`${API_BASE_URL}/register`, { // Llama a la API de registro en tu backend
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nombre, apellido, email, clave })
        });

        const data = await response.json();
        if (response.ok) {
            successDiv.textContent = '¡Registro exitoso! Ahora puedes iniciar sesión.';
            this.reset(); // Limpia el formulario
            setTimeout(() => {
                document.getElementById('show-login').click(); // Cambia a la vista de login
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

// --- Carga inicial y listeners globales ---
// Ejecuta updateUI cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', updateUI);
// Actualiza el avatar cuando la ventana cambia de tamaño
window.addEventListener('resize', showUserAvatar);

// Cierra el modal de perfil si se hace clic fuera de él
document.getElementById('perfil-modal-bg').addEventListener('click', function(e) {
    if (e.target === this) {
        closePerfilModal();
    }
});