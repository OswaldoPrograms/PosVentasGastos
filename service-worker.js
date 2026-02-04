/**
 * SERVICE WORKER - Funcionalidad Offline & Caching
 * 
 * El Service Worker es un script que se ejecuta en segundo plano y actúa como proxy
 * entre la aplicación y la red. Permite que la app funcione sin conexión a internet.
 * 
 * CARACTERÍSTICAS:
 * - Almacena archivos localmente (caching strategy)
 * - Sirve archivos del cache incluso sin conexión
 * - Actualiza archivos cuando hay conexión disponible
 */

// Nombre único del cache de esta versión de la aplicación
// Cambiar este número para forzar actualización del cache
const CACHE_NAME = 'triciclo-pos-v1';

// Lista de archivos que se almacenarán en el cache
// Estos archivos son lo MÍNIMO para que la app funcione offline
const ASSETS = [
    './',                    // Raíz de la aplicación
    './index.html',          // Página principal
    './style.css',           // Estilos CSS
    './app.js',              // Lógica de la aplicación
    './manifest.json',       // Configuración PWA
    // URLs externas de imágenes placeholder (actualizadas)
    'https://via.placeholder.com/192x192/6C5CE7/FFFFFF?text=El%20Triciclo',
    'https://via.placeholder.com/512x512/6C5CE7/FFFFFF?text=El%20Triciclo'
];

/**
 * EVENTO: install
 * Se ejecuta cuando el Service Worker se instala por primera vez o se actualiza
 * Descarga y almacena todos los archivos necesarios en el cache
 */
self.addEventListener('install', (event) => {
    // Espera a que se complete la instalación del cache
    event.waitUntil(
        // Abre el cache con el nombre especificado
        caches.open(CACHE_NAME).then((cache) => {
            // Agrega todos los archivos de ASSETS al cache
            // Si alguno falla, la instalación se puede completar de todos modos
            return cache.addAll(ASSETS);
        })
    );
});

/**
 * EVENTO: fetch
 * Se ejecuta cada vez que la aplicación hace una solicitud (GET, POST, etc.)
 * Implementa la estrategia: primero intenta servir del cache, si falla, usa red
 * Esto permite que funcione offline si los recursos están en el cache
 */
self.addEventListener('fetch', (event) => {
    // Responde a la solicitud con esta lógica
    event.respondWith(
        // Primero, intenta encontrar el archivo en el cache
        caches.match(event.request).then((response) => {
            // Si encuentra el archivo en cache, lo sirve
            if (response) {
                return response;
            }
            // Si no está en cache, intenta obtenerlo de la red (internet)
            // Si no hay conexión, fallará y se mostrará un error
            return fetch(event.request);
        })
    );
});
