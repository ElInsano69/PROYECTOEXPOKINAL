// --- Menú lateral ---
function toggleMenu() {
    const menu = document.getElementById('menu-list');
    menu.classList.toggle('show');
}

// Cierra el menú si se hace clic fuera de él
document.addEventListener('click', function(e) {
    const menu = document.getElementById('menu-list');
    const icon = document.querySelector('.menu-icon');
    // Si el clic fue dentro de un enlace del menú, no lo cierres
    if (e.target.closest('.menu-list a')) return;
    // Si el clic no fue dentro del menú ni en el ícono del menú, ciérralo
    if (!menu.contains(e.target) && !icon.contains(e.target)) {
        menu.classList.remove('show');
    }
});

// Manejo del tabIndex para accesibilidad del menú
document.addEventListener('DOMContentLoaded', function() {
    const menu = document.getElementById('menu-list');
    const links = menu.querySelectorAll('a');

    function updateLinks() {
        if (menu.classList.contains('show')) {
            links.forEach(a => a.tabIndex = 0); // Habilitar navegación por teclado
        } else {
            links.forEach(a => a.tabIndex = -1); // Deshabilitar navegación por teclado
        }
    }
    updateLinks(); // Llamar al inicio para establecer el estado inicial

    // Observar cambios en la clase 'show' del menú para actualizar tabIndex
    const observer = new MutationObserver(updateLinks);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
});


// Utilidades
function getInitials(nombre, apellido) {
    if (!nombre && !apellido) return "?";
    let initials = "";
    if (nombre) initials += nombre[0];
    if (apellido) initials[0];
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

// Define la URL base de tu API de Render.
// Asegúrate de reemplazar 'https://tu-app-de-render.onrender.com' con la URL real de tu backend desplegado en Render.
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

    tbody.innerHTML = '<tr><td colspan="7">Cargando usuarios...</td></tr>'; // Actualizado a 7 columnas
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
                fotoHtmlContainer.style.textAlign = 'center'; // Centrar el contenido de la celda de la foto
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
                // La celda de la foto se añade al final después del innerHTML para que se renderice correctamente
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = tr.innerHTML;
                tempDiv.lastElementChild.innerHTML = ''; // Limpiar el contenido de la última celda para agregar la foto
                tempDiv.lastElementChild.appendChild(fotoHtmlContainer.firstChild); // Añadir la foto al último td

                tr.innerHTML = tempDiv.innerHTML;
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

        // Mostrar la sección principal por defecto al iniciar sesión
        mainSection.style.display = '';
        usuariosSection.style.display = 'none'; // Asegurarse de que la sección de usuarios esté oculta al inicio

        if (currentUserEmail === 'admin@admin.com' && currentUserRole === 'admin') {
            adminDashboardLink.style.display = '';
            adminDashboardLink.onclick = async function(e) {
                e.preventDefault();
                mainSection.style.display = 'none'; // Ocultar sección principal
                usuariosSection.style.display = ''; // Mostrar sección de usuarios
                await cargarUsuariosDesdeBackend(); // Cargar datos
                toggleMenu(); // Cerrar el menú después de la selección
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
        closePerfilModal(); // Asegurarse de que el modal de perfil esté cerrado
    }
}


// --- Función para cerrar sesión ---
function logout() {
    localStorage.clear();
    
    const menu = document.getElementById('menu-list');
    if (menu) menu.classList.remove('show'); // Asegurarse de que el menú se cierra
    
    updateUI(); // Volver a la pantalla de login/registro
}

// --- Manejo de Login/Registro ---
document.getElementById('show-register').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-error').textContent = ''; // Limpiar errores de login
});

document.getElementById('show-login').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('register-error').textContent = ''; // Limpiar errores de registro
    document.getElementById('register-success').textContent = ''; // Limpiar mensaje de éxito de registro
});

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = this.elements.email.value;
    const clave = this.elements.clave.value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = ''; // Limpiar cualquier error anterior

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
            // Guardar datos del usuario en localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('logueado', 'si');
            localStorage.setItem('correo_actual', data.user.correo);
            localStorage.setItem('nombre_actual', data.user.nombre);
            localStorage.setItem('apellido_actual', data.user.apellido);
            localStorage.setItem('rol_actual', data.user.rol);
            localStorage.setItem('foto_actual', data.user.foto || ''); // Guarda la URL de la foto (o cadena vacía si no hay)
            localStorage.setItem('user', JSON.stringify(data.user)); // Guarda todo el objeto user para fácil acceso

            mostrarBienvenida(data.user.nombre);
            setTimeout(() => {
                updateUI(); // Actualiza la interfaz después de la animación de bienvenida
            }, 2500); 
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
    errorDiv.textContent = ''; // Limpiar errores anteriores
    successDiv.textContent = ''; // Limpiar mensajes de éxito anteriores

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
            this.reset(); // Limpiar el formulario
            setTimeout(() => {
                document.getElementById('show-login').click(); // Volver al formulario de login
            }, 2000); // Esperar 2 segundos antes de redirigir
        } else {
            errorDiv.textContent = data.message || 'Error en el registro';
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        errorDiv.textContent = 'Error de conexión con el servidor.';
    }
});

// Login de invitado
document.getElementById('guest-login-btn').addEventListener('click', guestLogin);
document.getElementById('guest-login-btn-register').addEventListener('click', guestLogin);

function guestLogin() {
    localStorage.setItem('logueado', 'si');
    localStorage.setItem('correo_actual', 'invitado@temp.com');
    localStorage.setItem('nombre_actual', 'Invitado');
    localStorage.setItem('apellido_actual', '');
    localStorage.setItem('rol_actual', 'estudiante'); // Rol por defecto para invitados
    localStorage.setItem('foto_actual', ''); // Invitados no tienen foto
    localStorage.setItem('token', 'guest_token_placeholder'); // Un token de marcador de posición
    localStorage.setItem('user', JSON.stringify({ // Objeto 'user' completo para consistencia
        id: 'guest',
        correo: 'invitado@temp.com',
        nombre: 'Invitado',
        apellido: '',
        rol: 'estudiante',
        foto: ''
    }));
    mostrarBienvenida('Invitado');
    setTimeout(() => {
        updateUI(); // Actualizar la interfaz después de la animación
    }, 2500); 
}

// Manejo de la subida de foto de perfil
document.getElementById('perfil-foto-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const token = localStorage.getItem('token');
    if (!token) {
        alert('No estás autenticado.');
        return;
    }

    // Aquí es donde integrarías la lógica real de subida de imágenes a un servicio como Cloudinary.
    // El código actual simula la obtención de una URL y luego la envía a tu backend.
    // Para un despliegue real, deberías reemplazar esto con la lógica de Cloudinary o similar.
    
    // **Ejemplo de cómo integrarías Cloudinary (requiere credenciales y setup)**
    // const CLOUDINARY_CLOUD_NAME = 'tu_cloud_name'; // Reemplaza con tu Cloud Name
    // const CLOUDINARY_UPLOAD_PRESET = 'tu_upload_preset'; // Reemplaza con tu Upload Preset
    // const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    // const formData = new FormData();
    // formData.append('file', file);
    // formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // try {
    //     const cloudinaryResponse = await fetch(CLOUDINARY_URL, {
    //         method: 'POST',
    //         body: formData
    //     });
    //     const cloudinaryData = await cloudinaryResponse.json();

    //     if (cloudinaryResponse.ok && cloudinaryData.secure_url) {
    //         const fotoUrl = cloudinaryData.secure_url;
            
    //         // Envía la URL segura de Cloudinary a tu backend para guardar en la DB
    //         const response = await fetch(`${API_BASE_URL}/profile/photo`, {
    //             method: 'POST',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //                 'Authorization': `Bearer ${token}`
    //             },
    //             body: JSON.stringify({ fotoUrl })
    //         });

    //         const data = await response.json();
    //         if (response.ok) {
    //             localStorage.setItem('foto_actual', fotoUrl); // Actualiza localStorage con la URL real
    //             // Puedes actualizar el objeto 'user' en localStorage también si lo deseas
    //             let user = JSON.parse(localStorage.getItem('user'));
    //             if (user) {
    //                 user.foto = fotoUrl;
    //                 localStorage.setItem('user', JSON.stringify(user));
    //             }
    //             showPerfilModal(); // Vuelve a renderizar el modal con la nueva foto
    //             showUserAvatar(); // Actualiza el avatar del header
    //             alert('Foto de perfil actualizada con éxito.');
    //         } else {
    //             alert('Error al actualizar la foto de perfil en la base de datos: ' + (data.message || 'Desconocido'));
    //         }
    //     } else {
    //         alert('Error al subir la imagen a Cloudinary.');
    //         console.error('Cloudinary response error:', cloudinaryData);
    //     }
    // } catch (error) {
    //     console.error('Error al subir la imagen a Cloudinary o al backend:', error);
    //     alert('Error de conexión al intentar subir la foto.');
    // }

    // **Código de ejemplo actual (placeholder)**
    // Esto crea una URL temporal para previsualizar la imagen en el navegador,
    // pero NO la sube a un servicio persistente ni la guarda en tu backend de forma real.
    const placeholderUrl = URL.createObjectURL(file); // Solo para previsualización local
    alert('En un entorno real, la imagen se subiría a un servicio de almacenamiento en la nube (ej. Cloudinary) y la URL se guardaría en tu base de datos.');
    localStorage.setItem('foto_actual', placeholderUrl); // Simula que la foto ha sido guardada
    
    // Envía la URL (incluso si es una temporal para pruebas) a tu backend
    // Tu backend espera una URL para guardar en la base de datos.
    // En un entorno real, 'fotoUrlParaBackend' sería la URL de Cloudinary.
    try {
        const response = await fetch(`${API_BASE_URL}/profile/photo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ fotoUrl: placeholderUrl }) // Aquí debería ir la URL persistente de la imagen subida
        });

        const data = await response.json();
        if (response.ok) {
            // Si el backend devuelve la URL final o un éxito, puedes actualizar
            // localStorage con la URL persistente si el backend la proporciona.
            // Por ahora, usamos el placeholder.
            console.log('URL de la foto enviada al backend y supuestamente guardada en DB.');
            showPerfilModal(); // Actualiza el modal con la nueva "foto"
            showUserAvatar(); // Actualiza el avatar del header
        } else {
            console.error('Error al enviar la URL de la foto al backend:', data.message || 'Desconocido');
            alert('Error al notificar al servidor sobre la nueva foto.');
        }
    } catch (error) {
        console.error('Error de conexión al enviar URL de foto al backend:', error);
        alert('Error de conexión al intentar actualizar la foto en el servidor.');
    }
});


// Carga inicial y listeners de eventos globales
document.addEventListener('DOMContentLoaded', updateUI); // Actualiza la UI al cargar la página
window.addEventListener('resize', showUserAvatar); // Para ajustar el tamaño del avatar en el header si la ventana cambia

// Cierra el modal de perfil si se hace clic fuera de él
document.getElementById('perfil-modal-bg').addEventListener('click', function(e) {
    if (e.target === this) { // Si el clic fue directamente en el fondo del modal
        closePerfilModal();
    }
});