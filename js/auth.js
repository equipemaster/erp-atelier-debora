import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase-config.js';
import Swal from 'sweetalert2';

/**
 * Realiza o login do usuário no Firebase
 * @param {string} email 
 * @param {string} password 
 */
export const login = async (email, password) => {
    // Validação básica
    if (!email || !password) {
        Swal.fire({
            icon: 'warning',
            title: 'Atenção',
            text: 'Preencha email e senha!'
        });
        return;
    }

    Swal.fire({
        title: 'Autenticando...',
        text: 'Aguarde um momento',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        await signInWithEmailAndPassword(auth, email, password);
        Swal.fire({
            icon: 'success',
            title: 'Bem-vindo!',
            timer: 1000,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'home.html';
        });
    } catch (error) {
        console.error("Erro Firebase auth:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro no Login',
            text: 'Credenciais inválidas ou conta não encontrada.'
        });
    }
};

/**
 * Desconecta o usuário logado
 */
export const logout = async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erro no logout:", error);
    }
};

/**
 * Verifica estado de autenticação (proteção de rotas)
 * @param {string} redirectUrl - URL de redirecionamento caso não esteja logado
 */
export const checkAuth = (redirectUrl = 'index.html') => {
    onAuthStateChanged(auth, user => {
        if (!user && window.location.pathname.indexOf('index.html') === -1 && window.location.pathname !== '/') {
            window.location.href = redirectUrl;
        }
    });
};
