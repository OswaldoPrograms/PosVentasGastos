/**
 * EL TRICICLO DEL SABOR - Core Application Logic
 * Sistema de Punto de Venta (POS) e Inventario
 * Implementación con Vanilla JavaScript (sin frameworks)
 * 
 * CARACTERÍSTICAS PRINCIPALES:
 * - Gestión de inventario de productos
 * - Sistema de punto de venta con contador de ventas
 * - Registro de historial de ventas
 * - Gestión de gastos por categoría
 * - Filtrado y generación de reportes (PDF/Excel)
 * - Almacenamiento local (LocalStorage) con capacidad de importar/exportar
 * - Offline-first PWA (Progressive Web App) con Service Worker
 */

// --- GESTIÓN DEL ESTADO DE LA APLICACIÓN ---
// AppState es el objeto central que mantiene todo el estado de la aplicación
// Se sincroniza automáticamente con LocalStorage para persistencia de datos
const AppState = {
    view: 'inventory', // Vista actual que se está mostrando (inventory, pos, sales, etc.)
    data: {
        products: [], // Lista de todos los productos disponibles
        salesHistory: [], // Registro histórico de todas las ventas realizadas
        expenses: [], // Lista de gastos registrados
        expenseCategories: [], // Categorías para clasificar gastos (Mercancia, Sueldos, Servicios, etc.)
        // SISTEMA POS - Variables para el flujo de venta del día
        posActiveProducts: [], // Productos seleccionados para vender hoy
        // SISTEMA DE PRESENTACIONES - Para negocio de aguas
        presentations: [], // Presentaciones predefinidas (500ml, 1L, 2L, etc.)
    }
};

// --- FUNCIONES UTILITARIAS ---
// Contiene funciones auxiliares para generar colores e imágenes placeholder
const Utils = {
    /**
     * Genera un color consistente basado en el nombre del producto
     * Usa hash del nombre para que el mismo producto siempre tenga el mismo color
     * @param {string} name - Nombre del producto
     * @returns {string} - Código de color en formato hexadecimal
     */
    getColorForProduct(name) {
        // Paleta de colores disponibles para los productos
        const colors = ['#FFFFFF','#F8F9FA','#EAEAEA','#F1F2F6','#6C5CE7','#5A3FD9','#A29BFE','#6C63FF','#0984E3','#74B9FF','#74C0FC','#00CEC9','#00A8A8','#55EFC4','#00B894','#00A36C','#FD79A8','#E84393','#FF6B6B','#FF7675','#D63031','#FF6348','#FDCB6E','#FFEAA7','#E17055','#E67E22','#FF9F1C','#B2BEC3','#636E72','#2D3436','#1E272E','#FFE4E1'];
        
        // Calcula un hash del nombre para asignar color de forma consistente
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Retorna el color correspondiente al hash calculado
        return colors[Math.abs(hash) % colors.length];
    },
    /**
     * Devuelve un color de contraste (negro o blanco) apropiado para texto sobre un fondo
     * @param {string} hex - color de fondo en hexadecimal
     */
    getContrastColor(hex) {
        if (!hex) return '#ffffff';
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0,2),16);
        const g = parseInt(c.substring(2,4),16);
        const b = parseInt(c.substring(4,6),16);
        // Perceived brightness
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 180 ? '#000000' : '#ffffff';
    },
    /**
     * Convierte un color hexadecimal a rgba con una opacidad dada
     * @param {string} hex - color en formato #rrggbb
     * @param {number} alpha - valor entre 0 y 1
     */
    hexToRgba(hex, alpha = 1) {
        if (!hex) return `rgba(0,0,0,${alpha})`;
        const c = hex.replace('#','');
        const r = parseInt(c.substring(0,2),16);
        const g = parseInt(c.substring(2,4),16);
        const b = parseInt(c.substring(4,6),16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    /** Escapa texto para evitar inyección de HTML en descripciones */
    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"]+/g, function (s) {
            switch (s) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                default: return s;
            }
        });
    },
    
    /**
     * Genera una imagen SVG placeholder cuando no hay imagen disponible
     * Muestra la primera letra del producto en un fondo de color
     * @param {string} name - Nombre del producto
     * @returns {string} - Data URL de imagen SVG
     */
    getPlaceholderImage(name) {
        // Obtiene la primera letra del nombre en mayúscula
        const initial = name.charAt(0).toUpperCase();
        
        // Obtiene el color asignado al producto
        const color = this.getColorForProduct(name);
        
        // Crea un SVG con el color y la inicial del producto
        return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="60" fill="white" font-weight="bold">${initial}</text></svg>`)}`;
    }
};

// --- SERVICIO DE ALMACENAMIENTO (STORAGE) ---
// Gestiona la persistencia de datos en LocalStorage del navegador
// Soporta carga, guardado, exportación e importación de datos
const Storage = {
    // Clave única en LocalStorage para almacenar los datos de la aplicación
    KEY: 'triciclo_pos_data',
    
    /**
     * Guarda el estado actual de la aplicación en LocalStorage
     * Convierte AppState.data a JSON string
     */
    save() {
        localStorage.setItem(this.KEY, JSON.stringify(AppState.data));
    },
    
    /**
     * Carga los datos guardados desde LocalStorage
     * Si hay datos previos, los restaura; si no, inicializa datos de prueba
     */
    load() {
        // Intenta recuperar datos del LocalStorage
        const stored = localStorage.getItem(this.KEY);
        
        if (stored) {
            // Si existen datos guardados, los restaura en AppState
            AppState.data = { ...AppState.data, ...JSON.parse(stored) };
        } else {
            // Primera vez: inicializa categorías de gastos por defecto
            AppState.data.expenseCategories = [
                { id: 1, name: 'Mercancia' },    // Para compras de productos
                { id: 2, name: 'Sueldos' },      // Para pagos de empleados
                { id: 3, name: 'Servicios' }     // Para servicios (luz, agua, etc.)
            ];
            
            // Presentaciones predefinidas para negocio de aguas (mínimo 500ml y 1L)
            AppState.data.presentations = [
                { id: 1, name: '500ml', liters: 0.5 },
                { id: 2, name: '1L', liters: 1 }
            ];
            // Guarda estos datos iniciales
            this.save(); ma
        }
        // Asegura que siempre existan 500ml y 1L aunque el usuario haya importado datos sin ellas
        if (!AppState.data.presentations) AppState.data.presentations = [];
        const ensure = (name, liters) => {
            if (!AppState.data.presentations.find(p => p.name === name || p.liters === liters)) {
                const newId = AppState.data.presentations.length ? Math.max(...AppState.data.presentations.map(p => p.id)) + 1 : 1;
                AppState.data.presentations.push({ id: newId, name, liters });
            }
        };
        ensure('500ml', 0.5);
        ensure('1L', 1);
        this.save();
    },
    
    /**
     * Exporta todos los datos de la aplicación a un archivo JSON
     * Útil para hacer respaldos o transferir datos entre dispositivos
     */
    exportData() {
        // Convierte los datos a JSON formateado (con indentación para legibilidad)
        const dataStr = JSON.stringify(AppState.data, null, 2);
        
        // Crea un objeto Blob con los datos JSON
        const blob = new Blob([dataStr], { type: 'application/json' });
        
        // Crea una URL temporal para el archivo
        const url = URL.createObjectURL(blob);
        
        // Crea un elemento <a> temporal para descargar el archivo
        const link = document.createElement('a');
        link.href = url;
        link.download = `triciclo_backup_${new Date().toISOString().split('T')[0]}.json`; // Nombre incluye la fecha
        link.click();
        
        // Libera la URL temporal después de descargar
        URL.revokeObjectURL(url);
    },
    
    /**
     * Importa datos desde un archivo JSON previamente exportado
     * Restaura todos los productos, ventas, gastos, etc.
     * @param {File} file - Archivo JSON a importar
     */
    importData(file) {
        // Crea un lector de archivos
        const reader = new FileReader();
        
        // Se ejecuta cuando el archivo se haya leído completamente
        reader.onload = (e) => {
            try {
                // Intenta parsear el contenido del archivo como JSON
                const imported = JSON.parse(e.target.result);
                
                // Reemplaza el estado actual con los datos importados
                AppState.data = imported;
                
                // Guarda los datos en LocalStorage
                this.save();
                
                // Notifica al usuario que la importación fue exitosa
                alert('✅ Datos importados correctamente');
                
                // Actualiza la vista actual para mostrar los datos importados
                Router.navigate(AppState.view);
            } catch (error) {
                // Si hay error al parsear, notifica al usuario
                alert('❌ Error al importar el archivo. Verifica que sea un archivo válido.');
            }
        };
        
        // Comienza a leer el archivo como texto
        reader.readAsText(file);
    }
};

// --- ROUTER Y RENDERIZADO DE VISTAS ---
// Gestiona la navegación entre diferentes páginas/vistas de la aplicación
// Controla qué vista se muestra basándose en la selección del usuario
const Router = {
    /**
     * Inicializa la aplicación
     * - Configura listeners de navegación
     * - Carga datos del almacenamiento
     * - Renderiza la vista inicial
     */
    init() {
        // Agrega listeners a cada botón de navegación en el sidebar
        document.querySelectorAll('.nav-links li').forEach(el => {
            el.addEventListener('click', (e) => {
                // Obtiene el nombre de la vista del atributo data-view
                const view = el.dataset.view;
                // Navega a la vista seleccionada
                this.navigate(view);
            });
        });

        // Carga los datos guardados previamente desde LocalStorage
        Storage.load();

        // Renderiza la vista inicial (Inventario)
        this.navigate('inventory');
    },

    /**
     * Navega a una vista específica
     * - Actualiza el estado de la aplicación
     * - Destaca el botón de navegación activo
     * - Renderiza el contenido de la vista seleccionada
     * @param {string} viewName - Nombre de la vista (inventory, pos, sales, etc.)
     */
    navigate(viewName) {
        // Actualiza el estado de la vista actual
        AppState.view = viewName;

        // Actualiza el estilo de los botones de navegación
        // Destaca el botón activo y remueve el highlight de los demás
        document.querySelectorAll('.nav-links li').forEach(el => {
            if (el.dataset.view === viewName) el.classList.add('active');
            else el.classList.remove('active');
        });

        // Obtiene el elemento donde se mostrará el contenido
        const main = document.getElementById('main-content');
        main.innerHTML = ''; // Limpia el contenido anterior

        // Renderiza la vista correspondiente basada en el nombre
        switch (viewName) {
            case 'inventory':
                // Vista de Inventario: muestra todos los productos
                main.appendChild(Views.inventory());
                break;
            case 'pos':
                // Vista de Punto de Venta: permite vender productos del día
                main.appendChild(Views.pos());
                break;
            case 'sales':
                // Vista de Ventas: muestra historial de ventas con filtros y reportes
                main.appendChild(Views.sales());
                break;
            case 'add-expense':
                // Vista para agregar nuevos gastos
                main.appendChild(Views.addExpense());
                break;
            case 'view-expenses':
                // Vista para ver y filtrar gastos registrados
                main.appendChild(Views.viewExpenses());
                break;
            case 'expenses': // Para compatibilidad con versiones anteriores
                this.navigate('add-expense');
                return;
            case 'settings':
                // Vista de Configuración: exportar/importar datos
                main.appendChild(Views.settings());
                break;
            default:
                // Si la vista no existe, muestra error 404
                main.innerHTML = '<h2>404 Not Found</h2>';
        }
    }
};

// --- VIEWS ---
const Views = {
    inventory() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>📦 Inventario</h2>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn" onclick="Actions.openProductModal()">+ Agregar Producto</button>
                    <button class="btn" onclick="Actions.openPresentationsModal(true)">🏷️ Presentaciones</button>
                </div>
            </div>
            <div class="grid" id="product-grid">
                 ${AppState.data.products.length ? AppState.data.products.map(p => this._renderProductCard(p)).join('') : '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No hay productos. Agrega uno nuevo.</p>'}
            </div>
        `;
        return container;
    },

    _renderProductCard(product) {
        // Usa el color del producto o genera uno basado en el nombre
        const color = product.color || Utils.getColorForProduct(product.name);
        const contrast = Utils.getContrastColor(color);
        const presentations = product.presentations || [];
        const pricePerLiter = product.pricePerLiter || product.price || 0;
        // Usar un rectángulo sólido del color del producto detrás de la descripción.
        // Si el color es muy claro, añadimos un borde sutil para que el rectángulo sea visible.
        const descBg = color;
        const descTextColor = Utils.getContrastColor(color);
        const isLightBg = descTextColor === '#000000';
        const descBorder = isLightBg ? `border:1px solid ${Utils.hexToRgba('#000000', 0.06)};` : '';

        return `
            <div class="card product-card">
                <div style="border-top: 4px solid ${color}; margin-bottom: 1rem;"></div>
                <h3>${product.name}</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">$${pricePerLiter.toFixed(2)}/L</p>
                <div class="product-desc" style="background-color: ${descBg}; color: ${descTextColor}; ${descBorder}">${product.description ? Utils.escapeHtml(product.description) : ''}</div>
                <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.8rem; justify-content: center;">
                    ${presentations.map(p => `<span style="border: 1px solid ${color}; color: ${color}; background: transparent; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">${p.name}</span>`).join('')}
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="Actions.openProductModal('${product.id}')">✏️</button>
                    <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="Actions.deleteProduct('${product.id}')">🗑️</button>
                </div>
            </div>
        `;
    },

    pos() {
        const hasActiveSession = AppState.data.posActiveProducts && AppState.data.posActiveProducts.length > 0;

        if (!hasActiveSession) {
            // VIEW: SETUP DAY
            const container = document.createElement('div');
            container.innerHTML = `
                <div class="page-header">
                    <h2>🌅 Iniciar Día de Ventas</h2>
                    <button class="btn btn-success" onclick="Actions.startPosDay()">Comenzar Venta ▶</button>
                </div>
                <div class="card" style="margin-bottom: 1rem;">
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">Selecciona los productos disponibles para vender hoy:</p>
                    <input type="text" id="pos-search" placeholder="🔍 Buscar producto..." style="width: 100%;" onkeyup="Actions.filterPosProducts()">
                </div>
                <div class="pos-setup-list" id="pos-setup-list">
                        ${AppState.data.products.map(p => {
                        const color = p.color || Utils.getColorForProduct(p.name);
                        const presentations = p.presentations || [];
                        const pricePerLiter = p.pricePerLiter || 0;
                        
                        return `
                        <label class="pos-checkbox-card" data-product-name="${p.name.toLowerCase()}" onclick="this.classList.toggle('selected', this.querySelector('input').checked)">
                            <input type="checkbox" value="${p.id}">
                            <div style="display: flex; align-items: center; gap: 0.8rem; flex: 1;">
                                <div style="background-color: ${color}; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                </div>
                                <div>
                                    <strong>${p.name}</strong>
                                    <div style="font-size: 0.8rem; color: var(--text-muted)">$${pricePerLiter.toFixed(2)}/L</div>
                                </div>
                            </div>
                        </label>
                    `;
                    }).join('')}
                </div>
            `;
            return container;
        } else {
            // VIEW: ACTIVE POS - Mostrar presentaciones de cada producto
            // Calcula el total sumando cada presentación vendida (precio * cantidad)
            const total = AppState.data.posActiveProducts.reduce((sum, prod) => {
                const presTotal = (prod.presentationItems || []).reduce((s, pi) => s + ((pi.price || 0) * (pi.count || 0)), 0);
                return sum + presTotal;
            }, 0);

            const container = document.createElement('div');
            container.innerHTML = `
                <div class="pos-total-banner">
                    <div>
                        <small>Total del Día</small>
                        <h2>$${total.toFixed(2)}</h2>
                    </div>
                    <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid white;" onclick="Actions.closePosDay()">🌙 Cerrar Día</button>
                </div>
                
                <div class="grid">
                    ${AppState.data.posActiveProducts.map(product => {
                        const presentations = product.presentations || [];
                        const color = product.color || Utils.getColorForProduct(product.name);
                        const pricePerLiter = product.pricePerLiter || 0;
                        
                        return `
                        <div class="card" style="padding: 1rem;">
                            <div style="border-top: 4px solid ${color}; margin-bottom: 0.8rem;"></div>
                            <h4 style="margin-bottom: 0.5rem;">${product.name}</h4>
                            <div style="margin-bottom: 1rem;">
                                ${presentations.map(p => {
                                    // Usa precio personalizado por presentación si existe, sino calcula desde pricePerLiter
                                    const presPrice = (p.price != null) ? p.price : (pricePerLiter * p.liters);
                                    const price = presPrice.toFixed(2);
                                    const item = AppState.data.posActiveProducts.find(pos => pos.id === product.id);
                                    const presItem = item?.presentationItems?.find(pi => pi.presentationId === p.id);
                                    const count = presItem?.count || 0;
                                    
                                    return `
                                        <div style="background-color: #f5f5f5; padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                                <span style="font-weight: 600;">${p.name}</span>
                                                <span style="color: var(--primary); font-weight: bold;">$${price}</span>
                                            </div>
                                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                                <button class="counter-btn btn-minus" onclick="Actions.updatePosItemCount('${product.id}', ${p.id}, -1)">-</button>
                                                <div class="count-display">${count}</div>
                                                <button class="counter-btn btn-plus" onclick="Actions.updatePosItemCount('${product.id}', ${p.id}, 1)">+</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                    }).join('')}
                </div>
            `;
            return container;
        }
    },

    sales() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>📊 Historial de Ventas</h2>
            </div>
            
            <!-- Filters & Actions -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <h3>Filtros y Exportación</h3>
                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Desde</label>
                        <input type="date" id="sales-date-from">
                    </div>
                    <div class="form-group">
                        <label>Hasta</label>
                        <input type="date" id="sales-date-to">
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn" onclick="Actions.filterSales()">🔍 Filtrar</button>
                    <button class="btn" style="background: var(--bg-body); color: var(--text-color); border: 1px solid var(--text-muted);" onclick="Actions.generateReport('sales', 'pdf')">📄 PDF</button>
                    <button class="btn" style="background: var(--success); color: white;" onclick="Actions.generateReport('sales', 'excel')">📊 Excel</button>
                </div>
            </div>

            <div id="sales-results" style="display: flex; flex-direction: column; gap: 1rem;">
                ${this._renderSalesList(AppState.data.salesHistory || [])}
            </div>
        `;
        return container;
    },

    _renderSalesList(sales) {
        if (!sales || sales.length === 0) return '<p>No hay ventas registradas en este periodo.</p>';
        return sales.slice().reverse().map(sale => `
            <div class="card">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${new Date(sale.date).toLocaleDateString()}</strong> a las <strong>${new Date(sale.date).toLocaleTimeString()}</strong>
                    </div>
                    <strong style="color: var(--success); font-size: 1.2rem;">$${sale.totalAmount.toFixed(2)}</strong>
                </div>
                <div style="font-size: 0.9rem;">
                    <strong style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Desglose de Productos:</strong>
                    ${sale.items.map(i => {
                        const product = AppState.data.products.find(p => p.id === (i.productId || i.name));
                        const status = product ? '' : ' <span style="background: var(--danger); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">DESCONTINUADO</span>';
                        // Show presentation info if available
                            const presentationInfo = i.presentationName ? ` ${i.presentationName}` : '';
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #f0f0f0;">
                                <div>
                                    <span style="font-weight: 600;">${i.count}x ${i.name}${presentationInfo}</span>${status}
                                    <div style="color: var(--text-muted); font-size: 0.8rem;">
                                        Precio unitario: $${(i.total / i.count).toFixed(2)}
                                    </div>
                                </div>
                                <div style="text-align: right; font-weight: bold;">
                                    $${i.total.toFixed(2)}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');
    },

    expenses() {
        // Legacy - redirect to add-expense
        return this.addExpense();
    },

    addExpense() {
        const categories = AppState.data.expenseCategories || [];
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>➕ Agregar Gasto</h2>
                <button class="btn" style="background-color: var(--secondary); color: white;" onclick="Actions.openCategoryModal()">⚙️ Categorías</button>
            </div>

            <div class="card">
                <form onsubmit="event.preventDefault(); Actions.saveExpense(this)">
                    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label>Categoría</label>
                            <select name="categoryId" required>
                                <option value="">Selecciona...</option>
                                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Monto ($)</label>
                            <input type="number" name="amount" step="0.5" required placeholder="0.00">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea name="description" rows="2" placeholder="Detalles del gasto..."></textarea>
                    </div>
                    <div style="text-align: right;">
                        <button type="submit" class="btn btn-success">Guardar Gasto</button>
                    </div>
                </form>
            </div>
        `;
        return container;
    },

    viewExpenses() {
        const categories = AppState.data.expenseCategories || [];
        const allExpenses = AppState.data.expenses || [];

        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>💸 Ver Gastos</h2>
            </div>

            <!-- Filters -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <h3>Filtros</h3>
                <div class="grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Desde</label>
                        <input type="date" id="filter-date-from">
                    </div>
                    <div class="form-group">
                        <label>Hasta</label>
                        <input type="date" id="filter-date-to">
                    </div>
                    <div class="form-group">
                        <label>Buscar</label>
                        <input type="text" id="filter-keyword" placeholder="Palabra clave...">
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn" onclick="Actions.filterExpenses()">Aplicar Filtros</button>
                    <button class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid #ccc;" onclick="Router.navigate('view-expenses')">Limpiar</button>
                    <div style="flex-grow: 1;"></div>
                    <button class="btn" style="background: var(--bg-body); color: var(--text-color); border: 1px solid var(--text-muted);" onclick="Actions.generateReport('expenses', 'pdf')">📄 PDF</button>
                    <button class="btn" style="background: var(--success); color: white;" onclick="Actions.generateReport('expenses', 'excel')">📊 Excel</button>
                </div>
            </div>

            <!-- Results -->
            <div id="expense-results">
                ${this._renderExpenseList(allExpenses, categories)}
            </div>
        `;
        return container;
    },

    _renderExpenseList(expenses, categories) {
        if (expenses.length === 0) return '<p>No hay gastos registrados.</p>';

        return `<div style="display: flex; flex-direction: column; gap: 1rem;">
            ${expenses.slice().reverse().map(exp => {
            const category = categories.find(c => c.id == exp.categoryId)?.name || 'General';
            return `
                <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem;">
                    <div>
                        <div style="font-weight: bold; color: var(--text-muted); font-size: 0.8rem;">${new Date(exp.date).toLocaleDateString()} - ${category}</div>
                        <div>${exp.description || 'Sin descripción'}</div>
                    </div>
                    <div style="font-weight: bold; color: var(--danger); font-size: 1.2rem;">
                        -$${parseFloat(exp.amount).toFixed(2)}
                        <button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; margin-left: 1rem;" onclick="Actions.deleteExpense('${exp.id}')">×</button>
                    </div>
                </div>
                `;
        }).join('')}
        </div>`;
    },

    settings() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>⚙️ Configuración</h2>
            </div>

            <div class="card" style="margin-bottom: 1.5rem;">
                <h3>📥 Respaldar Datos</h3>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Descarga todos tus datos en un archivo JSON para guardarlos de forma segura.</p>
                <button class="btn" onclick="Storage.exportData()">📥 Exportar Datos</button>
            </div>

            <div class="card">
                <h3>📤 Restaurar Datos</h3>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Importa un archivo de respaldo previamente exportado.</p>
                <input type="file" id="import-file" accept=".json" style="display: none;" onchange="Storage.importData(this.files[0])">
                <button class="btn" style="background-color: var(--secondary);" onclick="document.getElementById('import-file').click()">📤 Importar Datos</button>
            </div>
            
            
        `;
        return container;
    },

    // Generic Modal
    renderModal(title, contentHtml) {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${contentHtml}
                </div>
            </div>
        `;
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
    }
};

// --- ACTIONS (Controller Helpers) ---
const Actions = {
    openProductModal(productId = null) {
        const product = productId ? AppState.data.products.find(p => p.id === productId) : null;
        const title = product ? 'Editar Agua' : 'Nuevo Agua';
        
        // Paleta de colores disponibles (más extensa)
        const colors = ['#FFFFFF','#F8F9FA','#EAEAEA','#F1F2F6','#6C5CE7','#5A3FD9','#A29BFE','#6C63FF','#0984E3','#74B9FF','#74C0FC','#00CEC9','#00A8A8','#55EFC4','#00B894','#00A36C','#FD79A8','#E84393','#FF6B6B','#FF7675','#D63031','#FF6348','#FDCB6E','#FFEAA7','#E17055','#E67E22','#FF9F1C','#B2BEC3','#636E72','#2D3436','#1E272E','#FFE4E1'];
        const selectedColor = product?.color || colors[0];
        
        // Obtener presentaciones predefinidas
        const presentations = AppState.data.presentations || [];
        const productPresentations = product?.presentations || [];

        const formHtml = `
            <form id="product-form" onsubmit="event.preventDefault(); Actions.saveProduct('${productId || ''}')">
                <div class="form-group">
                    <label>Nombre del Agua</label>
                    <input type="text" name="name" value="${product ? product.name : ''}" required placeholder="Ej. Agua Purificada">
                </div>
                
                <div class="form-group">
                    <label>Precio por Litro ($)</label>
                    <input type="number" name="pricePerLiter" value="${product ? product.pricePerLiter : ''}" step="0.01" required placeholder="Ej. 1.50">
                    <small style="color: var(--text-muted);">Este precio se multiplicará por la presentación seleccionada</small>
                </div>
                
                <div class="form-group">
                    <label>Presentaciones Disponibles</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 1rem;">
                        ${presentations.map(pres => {
                            const isSelected = productPresentations.some(pp => pp.id === pres.id);
                            const selectedEntry = productPresentations.find(pp => pp.id === pres.id) || {};
                            const customPrice = selectedEntry.price || '';
                            return `
                                <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem; border: 2px solid ${isSelected ? 'var(--primary)' : '#e0e0e0'}; border-radius: 8px; cursor: pointer; background-color: ${isSelected ? 'rgba(108, 92, 231, 0.05)' : 'white'}; transition: all 0.2s;">
                                    <input type="checkbox" name="presentation" value="${pres.id}" ${isSelected ? 'checked' : ''} onchange="Actions.updatePresentationSelection()">
                                    <div style="flex:1;">
                                        <strong>${pres.name}</strong>
                                        <div style="font-size: 0.75rem; color: var(--text-muted);">${pres.liters}L</div>
                                    </div>
                                    <input type="number" name="presentation_price_${pres.id}" step="0.01" placeholder="Precio" value="${customPrice}" onchange="Actions.updatePresentationSelection()" style="width:90px;" />
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <input type="hidden" name="presentations" id="presentations-data" value='${JSON.stringify(productPresentations)}'>
                </div>
                
                <div class="form-group">
                    <label>Color del Producto</label>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(48px, 1fr)); gap: 0.8rem; margin-bottom: 1rem;">
                        ${colors.map(color => `
                            <button type="button" class="color-picker-btn ${selectedColor === color ? 'selected' : ''}" onclick="Actions.selectProductColor('${color}', this)" style="background-color: ${color};" title="${color}" aria-label="Seleccionar color ${color}"></button>
                        `).join('')}
                    </div>
                    <input type="hidden" name="color" id="product-color" value="${selectedColor}">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid #ccc" onclick="document.querySelector('.modal-overlay').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-success">Guardar</button>
                </div>
            </form>
        `;

        Views.renderModal(title, formHtml);
    },

    /**
     * Actualiza la selección de presentaciones en el formulario
     * Recoge los checkboxes seleccionados y los guarda en el campo oculto
     */
    updatePresentationSelection() {
        const presentations = AppState.data.presentations || [];
        const checked = document.querySelectorAll('input[name="presentation"]:checked');
        const selected = Array.from(checked).map(cb => {
            const presId = parseInt(cb.value);
            const pres = presentations.find(p => p.id === presId) || { id: presId };
            const priceInput = document.querySelector(`input[name="presentation_price_${presId}"]`);
            const priceVal = priceInput ? parseFloat(priceInput.value) : null;
            return { id: pres.id, name: pres.name, liters: pres.liters, price: isNaN(priceVal) ? null : priceVal };
        }).filter(p => p);

        document.getElementById('presentations-data').value = JSON.stringify(selected);
    },

    /**
     * Selecciona un color para el producto
     * Actualiza el campo oculto y destaca el botón seleccionado
     */
    selectProductColor(color, element) {
        // Remueve la clase 'selected' de todos los botones y añade la clase al clickeado
        document.querySelectorAll('.color-picker-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        // Actualiza el valor del campo oculto
        document.getElementById('product-color').value = color;
    },

    saveProduct(id) {
        const form = document.getElementById('product-form');
        const formData = new FormData(form);
        const name = formData.get('name');
        const pricePerLiter = parseFloat(formData.get('pricePerLiter'));
        const color = formData.get('color');
        const presentations = JSON.parse(formData.get('presentations') || '[]');

        if (presentations.length === 0) {
            alert('Por favor selecciona al menos una presentación');
            return;
        }

        if (id) {
            // Edit
            const index = AppState.data.products.findIndex(p => p.id === id);
            if (index !== -1) {
                AppState.data.products[index] = { 
                    ...AppState.data.products[index], 
                    name, 
                    pricePerLiter, 
                    color,
                    presentations 
                };
            }
        } else {
            // Create
            const newProduct = {
                id: Date.now().toString(),
                name,
                pricePerLiter,
                color,
                presentations,
                category: 'default'
            };
            AppState.data.products.push(newProduct);
        }

        Storage.save();
        document.querySelector('.modal-overlay').remove();
        Router.navigate('inventory'); // Re-render
    },

    deleteProduct(id) {
        if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
            AppState.data.products = AppState.data.products.filter(p => p.id !== id);
            Storage.save();
            Router.navigate('inventory');
        }
    },

    // --- POS ACTIONS ---
    startPosDay() {
        const inputs = document.querySelectorAll('#pos-setup-list input:checked');
        if (inputs.length === 0) {
            alert('Por favor selecciona al menos un producto para vender hoy.');
            return;
        }

        const selectedIds = Array.from(inputs).map(i => i.value);
        AppState.data.posActiveProducts = AppState.data.products
            .filter(p => selectedIds.includes(p.id))
            .map(p => ({ 
                ...p, 
                presentationItems: (p.presentations || []).map(pres => ({
                    presentationId: pres.id,
                    count: 0,
                    price: (pres.price != null) ? pres.price : ((p.pricePerLiter || 0) * pres.liters)
                }))
            }));

        Storage.save();
        Router.navigate('pos');
    },

    /**
     * Actualiza la cantidad de un producto en una presentación específica
     */
    updatePosItemCount(productId, presentationId, delta) {
        const product = AppState.data.posActiveProducts.find(p => p.id === productId);
        if (product) {
            const presItem = product.presentationItems.find(pi => pi.presentationId === presentationId);
            if (presItem) {
                const newCount = presItem.count + delta;
                if (newCount >= 0) {
                    presItem.count = newCount;
                    Storage.save();
                    Router.navigate('pos'); // Re-render
                }
            }
        }
    },

    updatePosCount(id, delta) {
        const item = AppState.data.posActiveProducts.find(p => p.id === id);
        if (item) {
            const newCount = item.count + delta;
            if (newCount >= 0) {
                item.count = newCount;
                Storage.save();
                Router.navigate('pos'); // Re-render to update UI
            }
        }
    },

    /**
     * Filtra los productos en la vista de configuración del POS
     * Basado en el texto ingresado en el buscador
     */
    filterPosProducts() {
        const searchTerm = document.getElementById('pos-search')?.value.toLowerCase() || '';
        const productCards = document.querySelectorAll('#pos-setup-list .pos-checkbox-card');
        
        productCards.forEach(card => {
            const productName = card.getAttribute('data-product-name');
            // Muestra el producto si contiene el término de búsqueda
            card.style.display = productName.includes(searchTerm) ? '' : 'none';
        });
    },

    closePosDay() {
        // Calcular ventas desglosadas por presentación
        let totalAmount = 0;
        let items = [];

        AppState.data.posActiveProducts.forEach(product => {
            const presentations = product.presentations || [];
            (product.presentationItems || []).forEach(presItem => {
                if (presItem.count > 0) {
                    const presentation = presentations.find(p => p.id === presItem.presentationId);
                    totalAmount += presItem.price * presItem.count;
                    items.push({
                        productId: product.id,
                        name: product.name,
                        presentationName: presentation?.name || 'Desconocida',
                        price: presItem.price,
                        count: presItem.count,
                        total: presItem.price * presItem.count
                    });
                }
            });
        });

        if (items.length === 0 && !confirm('No has vendido nada. ¿Quieres cerrar el día de todos modos?')) {
            return;
        }

        const record = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            totalAmount: totalAmount,
            items: items
        };

        if (!AppState.data.salesHistory) AppState.data.salesHistory = [];
        AppState.data.salesHistory.push(record);

        // Reset Active POS
        AppState.data.posActiveProducts = [];

        Storage.save();
        alert(`Día cerrado con éxito. Total vendido: $${totalAmount.toFixed(2)}`);
        Router.navigate('sales');
    },

    // --- EXPENSE ACTIONS ---
    openCategoryModal() {
        const categories = AppState.data.expenseCategories || [];
        const html = `
            <div>
                <form onsubmit="event.preventDefault(); Actions.addCategory(this.querySelector('input').value)">
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" placeholder="Nueva Categoría..." required>
                        <button class="btn btn-success">+</button>
                    </div>
                </form>
                <div style="margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${categories.map(c => `
                        <span style="background: var(--bg-body); padding: 0.3rem 0.6rem; border-radius: 20px; font-size: 0.9rem; border: 1px solid #ccc;">
                            ${c.name} 
                            <span onclick="Actions.deleteCategory(${c.id})" style="cursor: pointer; margin-left: 0.5rem; color: var(--danger); font-weight: bold;">×</span>
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
        Views.renderModal('Gestionar Categorías', html);
    },

    addCategory(name) {
        if (!AppState.data.expenseCategories) AppState.data.expenseCategories = [];
        AppState.data.expenseCategories.push({ id: Date.now(), name });
        Storage.save();
        Actions.openCategoryModal(); // Refresh modal
        // Also refresh page if needed, but modal is open
    },

    deleteCategory(id) {
        if (confirm('Eliminar categoría?')) {
            AppState.data.expenseCategories = AppState.data.expenseCategories.filter(c => c.id !== id);
            Storage.save();
            Actions.openCategoryModal();
        }
    },

    // --- PRESENTATIONS (Tamaños) ---
    openPresentationsModal(adminOnly = false) {
        const presentations = AppState.data.presentations || [];
        const listHtml = presentations.map(p => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.5rem 0; border-bottom:1px solid #f0f0f0;">
                <div style="display:flex; gap:0.6rem; align-items:center;">
                    <div>
                        <strong>${p.name}</strong>
                        <div style="font-size:0.85rem; color:var(--text-muted);">${p.liters} L</div>
                    </div>
                </div>
                ${adminOnly ? `<div style="display:flex; gap:0.5rem;"><button class=\"btn\" onclick=\"Actions.editPresentation(${p.id})\">✏️</button><button class=\"btn btn-danger\" onclick=\"Actions.deletePresentation(${p.id})\">🗑️</button></div>` : ''}
            </div>
        `).join('');

        const html = `
            <div>
                <div style="margin-bottom:0.8rem;">${listHtml || '<div style="color:var(--text-muted);">No hay presentaciones configuradas.</div>'}</div>
                <hr />
                <form id="presentation-form" onsubmit="event.preventDefault(); Actions.addPresentation()">
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
                        <input type="text" name="name" placeholder="Nombre (Ej. 500ml)" required style="flex:1;">
                        <input type="number" step="0.01" name="liters" placeholder="Litros" required style="width:110px;">
                    </div>
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                        <button class="btn" type="button" onclick="document.querySelector('.modal-overlay').remove()">Cerrar</button>
                        <button class="btn btn-success">Agregar</button>
                    </div>
                </form>
            </div>
        `;

        Views.renderModal('Gestionar Presentaciones', html);
    },

    addPresentation() {
        const form = document.getElementById('presentation-form');
        const fd = new FormData(form);
        const name = fd.get('name');
        const liters = parseFloat(fd.get('liters'));
        if (!AppState.data.presentations) AppState.data.presentations = [];
        const newId = AppState.data.presentations.length ? Math.max(...AppState.data.presentations.map(p => p.id)) + 1 : 1;
        AppState.data.presentations.push({ id: newId, name, liters });
        Storage.save();
        // Reopen modal to refresh list
        Actions.openPresentationsModal(true);
    },

    deletePresentation(id) {
        if (!confirm('Eliminar presentación? Esto también quitará la presentación de productos existentes.')) return;
        AppState.data.presentations = (AppState.data.presentations || []).filter(p => p.id !== id);

        // Remove presentation references from products
        AppState.data.products = (AppState.data.products || []).map(prod => ({
            ...prod,
            presentations: (prod.presentations || []).filter(pr => pr.id !== id)
        }));

        Storage.save();
        Actions.openPresentationsModal(true);
    },

    editPresentation(id) {
        const pres = (AppState.data.presentations || []).find(p => p.id === id);
        if (!pres) return alert('Presentación no encontrada');

        const html = `
            <form id="presentation-edit-form" onsubmit="event.preventDefault(); Actions.saveEditedPresentation(${id})">
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
                    <input type="text" name="name" value="${pres.name}" required style="flex:1;">
                    <input type="number" step="0.01" name="liters" value="${pres.liters}" required style="width:110px;">
                </div>
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                    <button class="btn" type="button" onclick="Actions.openPresentationsModal(true)">Cancelar</button>
                    <button class="btn btn-success">Guardar</button>
                </div>
            </form>
        `;

        Views.renderModal('Editar Presentación', html);
    },

    saveEditedPresentation(id) {
        const form = document.getElementById('presentation-edit-form');
        const fd = new FormData(form);
        const name = fd.get('name');
        const liters = parseFloat(fd.get('liters'));
        AppState.data.presentations = (AppState.data.presentations || []).map(p => p.id === id ? { ...p, name, liters } : p);
        Storage.save();
        Actions.openPresentationsModal(true);
    },

    saveExpense(form) {
        const formData = new FormData(form);
        const expense = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            categoryId: formData.get('categoryId'),
            amount: formData.get('amount'),
            description: formData.get('description'),
        };

        if (!AppState.data.expenses) AppState.data.expenses = [];
        AppState.data.expenses.push(expense);
        Storage.save();
        Router.navigate('expenses');
    },

    deleteExpense(id) {
        if (confirm('Eliminar registro de gasto?')) {
            AppState.data.expenses = AppState.data.expenses.filter(e => e.id !== id);
            Storage.save();
            Router.navigate('expenses');
        }
    },

    // --- FILTERS & REPORTS ---
    filterSales() {
        const from = document.getElementById('sales-date-from').value;
        const to = document.getElementById('sales-date-to').value;

        let filtered = AppState.data.salesHistory || [];

        if (from) {
            const fromDate = new Date(from);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(s => new Date(s.date) >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(s => new Date(s.date) <= toDate);
        }

        document.getElementById('sales-results').innerHTML = Views._renderSalesList(filtered);
    },

    filterExpenses() {
        const from = document.getElementById('filter-date-from').value;
        const to = document.getElementById('filter-date-to').value;
        const keyword = document.getElementById('filter-keyword').value.toLowerCase();

        let filtered = AppState.data.expenses || [];

        if (from) {
            const fromDate = new Date(from);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(e => new Date(e.date) >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(e => new Date(e.date) <= toDate);
        }
        if (keyword) {
            filtered = filtered.filter(e =>
                (e.description && e.description.toLowerCase().includes(keyword)) ||
                (AppState.data.expenseCategories.find(c => c.id == e.categoryId)?.name || '').toLowerCase().includes(keyword)
            );
        }

        document.getElementById('expense-results').innerHTML = Views._renderExpenseList(filtered, AppState.data.expenseCategories);
    },

    generateReport(type, format) {
        // Gather data similar to filters
        let data = [];
        let headers = [];
        let rows = [];
        let title = '';
        let dateRange = '';

        if (type === 'sales') {
            title = 'Reporte de Ventas - Detallado por Producto';
            const from = document.getElementById('sales-date-from').value;
            const to = document.getElementById('sales-date-to').value;
            dateRange = `Desde: ${from || 'Inicio'} - Hasta: ${to || 'Hoy'}`;

            // Re-apply filter logic
            let filtered = AppState.data.salesHistory || [];
            if (from) filtered = filtered.filter(s => new Date(s.date) >= new Date(from).setHours(0, 0, 0, 0));
            if (to) filtered = filtered.filter(s => new Date(s.date) <= new Date(to).setHours(23, 59, 59, 999));

            data = filtered;
            
            // Crear desglose detallado por producto
            let productsData = {};
            let totalVentas = 0;
            let totalProductos = 0;
            
            data.forEach(sale => {
                sale.items.forEach(item => {
                    const product = AppState.data.products.find(p => p.id === item.name);
                    const productStatus = product ? 'Activo' : 'DESCONTINUADO';
                    const key = `${item.name}|${item.price}|${productStatus}`;
                    
                    if (!productsData[key]) {
                        productsData[key] = {
                            name: item.name,
                            price: item.price,
                            status: productStatus,
                            quantity: 0,
                            total: 0
                        };
                    }
                    productsData[key].quantity += item.count;
                    productsData[key].total += item.total;
                    totalVentas += item.total;
                    totalProductos += item.count;
                });
            });
            
            headers = [['Producto', 'Precio Unit.', 'Cantidad', 'Total Vendido', 'Estado']];
            rows = Object.values(productsData).map(p => [
                p.name,
                `$${p.price.toFixed(2)}`,
                `${p.quantity} unidades`,
                `$${p.total.toFixed(2)}`,
                p.status
            ]);
            
            // Agregar fila de totales
            rows.push(['', '', '', '', '']);
            rows.push(['TOTALES', '', `${totalProductos} unidades`, `$${totalVentas.toFixed(2)}`, '']);
        } else if (type === 'expenses') {
            title = 'Reporte de Gastos';
            const from = document.getElementById('filter-date-from').value;
            const to = document.getElementById('filter-date-to').value;
            const keyword = document.getElementById('filter-keyword').value.toLowerCase();
            dateRange = `Desde: ${from || 'Inicio'} - Hasta: ${to || 'Hoy'}`;

            let filtered = AppState.data.expenses || [];
            if (from) filtered = filtered.filter(e => new Date(e.date) >= new Date(from).setHours(0, 0, 0, 0));
            if (to) filtered = filtered.filter(e => new Date(e.date) <= new Date(to).setHours(23, 59, 59, 999));
            if (keyword) filtered = filtered.filter(e =>
                (e.description && e.description.toLowerCase().includes(keyword)) ||
                (AppState.data.expenseCategories.find(c => c.id == e.categoryId)?.name || '').toLowerCase().includes(keyword)
            );

            data = filtered;
            headers = [['Fecha', 'Categoría', 'Descripción', 'Monto']];
            rows = data.map(exp => [
                new Date(exp.date).toLocaleDateString(),
                AppState.data.expenseCategories.find(c => c.id == exp.categoryId)?.name || 'General',
                exp.description || '',
                `$${parseFloat(exp.amount).toFixed(2)}`
            ]);
        }

        if (rows.length === 0) {
            alert('No hay datos para exportar con los filtros seleccionados.');
            return;
        }

        if (format === 'pdf') {
            if (!window.jspdf) { alert('Librería PDF no cargada. Verifica tu conexión.'); return; }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.text(title, 14, 22);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(dateRange, 14, 30);

            doc.autoTable({
                head: headers,
                body: rows,
                startY: 40,
                theme: 'grid',
                headStyles: { fillColor: [108, 92, 231] }, // Brand color
                bodyStyles: { textColor: [45, 52, 54] },
                alternateRowStyles: { fillColor: [244, 247, 246] }
            });

            doc.save(`${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
        } else if (format === 'excel') {
            if (!window.XLSX) { alert('Librería Excel no cargada. Verifica tu conexión.'); return; }

            const wb = XLSX.utils.book_new();
            const wsData = [headers[0], ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            XLSX.utils.book_append_sheet(wb, ws, "Reporte");
            XLSX.writeFile(wb, `${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    Router.init();
});
