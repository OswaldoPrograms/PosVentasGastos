/**
 * EL TRICICLO DEL SABOR - Core Application Logic
 * Sistema de Punto de Venta (POS) e Inventario
 * Implementación con Vanilla JavaScript (sin frameworks)
 * 
 * CARACTERÍSTICAS PRINCIPALES:
 * - Gestión de inventario de productos (con precios por presentación)
 * - Sistema de punto de venta con render parcial (sin parpadeo)
 * - Registro de historial de ventas con resúmenes (hoy/semana/mes + top productos)
 * - Gestión de gastos por categoría
 * - Filtrado y generación de reportes (PDF/Excel) con desglose por presentación
 * - Almacenamiento local (LocalStorage) con validación al importar/exportar
 * - Offline-first PWA (Progressive Web App) con Service Worker
 * - Sistema de Undo en POS
 * - Protección de presentaciones base (500ml, 1L)
 * - Timestamps (createdAt/updatedAt) en entidades
 * - IDs estandarizados (string) en toda la app
 * 
 * VERSIÓN DE DATOS: 2
 */

// --- GESTIÓN DEL ESTADO DE LA APLICACIÓN ---
const AppState = {
    view: 'inventory',
    data: {
        dataVersion: 2,
        products: [],
        salesHistory: [],
        expenses: [],
        expenseCategories: [],
        posActiveProducts: [],
        presentations: [],
    }
};

// --- STACK DE UNDO PARA POS ---
const UndoStack = {
    _stack: [],
    _maxSize: 50,

    push() {
        const snapshot = JSON.parse(JSON.stringify(AppState.data.posActiveProducts));
        this._stack.push(snapshot);
        if (this._stack.length > this._maxSize) this._stack.shift();
    },

    pop() {
        if (this._stack.length === 0) return null;
        return this._stack.pop();
    },

    canUndo() {
        return this._stack.length > 0;
    },

    clear() {
        this._stack = [];
    }
};

// --- FUNCIONES UTILITARIAS ---
const Utils = {
    getColorForProduct(name) {
        const colors = ['#FFFFFF','#6C5CE7','#5A3FD9','#A29BFE','#6C63FF','#0984E3','#74B9FF','#74C0FC','#00CEC9','#00A8A8','#55EFC4','#00B894','#00A36C','#FD79A8','#E84393','#FF6B6B','#FF7675','#D63031','#FF6348','#FDCB6E','#FFEAA7','#E17055','#E67E22','#FF9F1C','#B2BEC3','#636E72','#2D3436','#1E272E'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    },

    getContrastColor(hex) {
        if (!hex) return '#ffffff';
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0,2),16);
        const g = parseInt(c.substring(2,4),16);
        const b = parseInt(c.substring(4,6),16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 180 ? '#000000' : '#ffffff';
    },

    hexToRgba(hex, alpha = 1) {
        if (!hex) return `rgba(0,0,0,${alpha})`;
        const c = hex.replace('#','');
        const r = parseInt(c.substring(0,2),16);
        const g = parseInt(c.substring(2,4),16);
        const b = parseInt(c.substring(4,6),16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

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
    
    getPlaceholderImage(name) {
        const initial = name.charAt(0).toUpperCase();
        const color = this.getColorForProduct(name);
        return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="60" fill="white" font-weight="bold">${initial}</text></svg>`)}`;
    },

    /** Genera un ID único string */
    generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    },

    /** Debounce: retrasa la ejecución hasta que deje de ser invocada */
    debounce(fn, delay = 200) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
};

// --- SERVICIO DE ALMACENAMIENTO (STORAGE) ---
const Storage = {
    KEY: 'triciclo_pos_data',
    
    save() {
        localStorage.setItem(this.KEY, JSON.stringify(AppState.data));
    },
    
    load() {
        const stored = localStorage.getItem(this.KEY);
        
        if (stored) {
            const parsed = JSON.parse(stored);
            AppState.data = { ...AppState.data, ...parsed };
        } else {
            AppState.data.expenseCategories = [
                { id: Utils.generateId(), name: 'Mercancia', createdAt: new Date().toISOString() },
                { id: Utils.generateId(), name: 'Sueldos', createdAt: new Date().toISOString() },
                { id: Utils.generateId(), name: 'Servicios', createdAt: new Date().toISOString() }
            ];
            AppState.data.presentations = [
                { id: 1, name: '500ml', liters: 0.5, createdAt: new Date().toISOString(), isProtected: true },
                { id: 2, name: '1L', liters: 1, createdAt: new Date().toISOString(), isProtected: true }
            ];
            this.save();
        }

        // Asegurar presentaciones base
        if (!AppState.data.presentations) AppState.data.presentations = [];
        const ensure = (name, liters) => {
            if (!AppState.data.presentations.find(p => p.name === name || p.liters === liters)) {
                const newId = AppState.data.presentations.length ? Math.max(...AppState.data.presentations.map(p => typeof p.id === 'number' ? p.id : 0)) + 1 : 1;
                AppState.data.presentations.push({ id: newId, name, liters, createdAt: new Date().toISOString(), isProtected: true });
            }
        };
        ensure('500ml', 0.5);
        ensure('1L', 1);

        // Marcar presentaciones base como protegidas
        AppState.data.presentations.forEach(p => {
            if ((p.name === '500ml' && p.liters === 0.5) || (p.name === '1L' && p.liters === 1)) {
                p.isProtected = true;
            }
        });

        if (!AppState.data.dataVersion) AppState.data.dataVersion = 2;
        this.save();
    },
    
    exportData() {
        const dataStr = JSON.stringify(AppState.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `triciclo_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    },
    
    /**
     * Valida la estructura de datos importados.
     * Asegura que todos los campos requeridos existan y sean del tipo correcto.
     */
    validateImportData(data) {
        const errors = [];

        if (typeof data !== 'object' || data === null) {
            return { valid: false, errors: ['El archivo no contiene un objeto JSON válido.'], sanitized: null };
        }

        const sanitized = {
            dataVersion: data.dataVersion || 2,
            products: [],
            salesHistory: [],
            expenses: [],
            expenseCategories: [],
            posActiveProducts: [],
            presentations: [],
        };

        // Validar products
        if (Array.isArray(data.products)) {
            sanitized.products = data.products.filter(p => {
                if (!p || typeof p !== 'object') return false;
                if (!p.id || !p.name) { errors.push('Producto sin id o nombre omitido.'); return false; }
                return true;
            }).map(p => ({
                ...p,
                id: String(p.id),
                name: String(p.name || ''),
                pricePerLiter: parseFloat(p.pricePerLiter) || parseFloat(p.price) || 0,
                color: p.color || null,
                presentations: Array.isArray(p.presentations) ? p.presentations : [],
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: p.updatedAt || new Date().toISOString(),
            }));
        } else if (data.products !== undefined) {
            errors.push('"products" no es un array, se usará array vacío.');
        }

        // Validar salesHistory
        if (Array.isArray(data.salesHistory)) {
            sanitized.salesHistory = data.salesHistory.filter(s => {
                if (!s || typeof s !== 'object') return false;
                if (!s.date) { errors.push('Venta sin fecha omitida.'); return false; }
                return true;
            }).map(s => ({
                ...s,
                id: String(s.id || Utils.generateId()),
                totalAmount: parseFloat(s.totalAmount) || 0,
                items: Array.isArray(s.items) ? s.items : [],
            }));
        } else if (data.salesHistory !== undefined) {
            errors.push('"salesHistory" no es un array, se usará array vacío.');
        }

        // Validar expenses
        if (Array.isArray(data.expenses)) {
            sanitized.expenses = data.expenses.filter(e => e && typeof e === 'object').map(e => ({
                ...e,
                id: String(e.id || Utils.generateId()),
                amount: parseFloat(e.amount) || 0,
                date: e.date || new Date().toISOString(),
            }));
        } else if (data.expenses !== undefined) {
            errors.push('"expenses" no es un array, se usará array vacío.');
        }

        // Validar expenseCategories
        if (Array.isArray(data.expenseCategories)) {
            sanitized.expenseCategories = data.expenseCategories.filter(c => c && c.name).map(c => ({
                ...c,
                id: c.id != null ? String(c.id) : Utils.generateId(),
                name: String(c.name),
            }));
        } else if (data.expenseCategories !== undefined) {
            errors.push('"expenseCategories" no es un array, se usará array vacío.');
        }

        // Validar presentations
        if (Array.isArray(data.presentations)) {
            sanitized.presentations = data.presentations.filter(p => p && p.name && p.liters != null).map(p => ({
                ...p,
                liters: parseFloat(p.liters) || 0,
            }));
        } else if (data.presentations !== undefined) {
            errors.push('"presentations" no es un array, se usará array vacío.');
        }

        sanitized.posActiveProducts = [];

        return { valid: true, errors, sanitized };
    },

    importData(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                const { valid, errors, sanitized } = this.validateImportData(imported);

                if (!valid) {
                    alert('❌ ' + errors.join('\n'));
                    return;
                }

                if (errors.length > 0) {
                    console.warn('Advertencias al importar:', errors);
                }

                AppState.data = sanitized;
                this.save();
                this.load(); // Asegurar presentaciones base

                const warningMsg = errors.length > 0 ? `\n⚠️ ${errors.length} advertencia(s) corregidas automáticamente.` : '';
                alert('✅ Datos importados correctamente.' + warningMsg);
                Router.navigate(AppState.view);
            } catch (error) {
                alert('❌ Error al importar el archivo. Verifica que sea un archivo JSON válido.');
            }
        };
        
        reader.readAsText(file);
    }
};

// --- ROUTER Y RENDERIZADO DE VISTAS ---
const Router = {
    init() {
        document.querySelectorAll('.nav-links li').forEach(el => {
            el.addEventListener('click', () => {
                const view = el.dataset.view;
                this.navigate(view);
            });
        });

        Storage.load();
        this.navigate('inventory');
    },

    navigate(viewName) {
        AppState.view = viewName;

        document.querySelectorAll('.nav-links li').forEach(el => {
            if (el.dataset.view === viewName) el.classList.add('active');
            else el.classList.remove('active');
        });

        const main = document.getElementById('main-content');
        main.innerHTML = '';

        switch (viewName) {
            case 'inventory':
                main.appendChild(Views.inventory());
                break;
            case 'pos':
                main.appendChild(Views.pos());
                break;
            case 'sales':
                main.appendChild(Views.sales());
                break;
            case 'add-expense':
                main.appendChild(Views.addExpense());
                break;
            case 'view-expenses':
                main.appendChild(Views.viewExpenses());
                break;
            case 'expenses':
                this.navigate('add-expense');
                return;
            case 'settings':
                main.appendChild(Views.settings());
                break;
            default:
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
        const color = product.color || Utils.getColorForProduct(product.name);
        const contrast = Utils.getContrastColor(color);
        const presentations = product.presentations || [];
        const pricePerLiter = product.pricePerLiter || product.price || 0;

        return `
            <div class="card product-card">
                <div class="product-hero" style="background-color: ${color}; color: ${contrast};">
                    <div class="product-hero-inner">
                        <h3 class="hero-name">${product.name}</h3>
                        <div class="hero-price">$${pricePerLiter.toFixed(2)}/L</div>
                    </div>
                </div>

                <div class="product-body">
                    <div class="product-description" style="color: var(--text-muted);">${product.description ? Utils.escapeHtml(product.description) : ''}</div>

                    <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; margin: 0.8rem 0; justify-content: center;">
                        ${presentations.map(p => {
                            const presPrice = (p.price != null) ? `$${parseFloat(p.price).toFixed(2)}` : `$${(pricePerLiter * p.liters).toFixed(2)}`;
                            return `<span class="presentation-pill" style="border: 2px solid ${color}; color: var(--text-main);" title="Precio: ${presPrice}">${p.name} <small style="opacity:0.7;">${presPrice}</small></span>`;
                        }).join('')}
                    </div>

                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="Actions.openProductModal('${product.id}')">✏️</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="Actions.deleteProduct('${product.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    },

    pos() {
        const hasActiveSession = AppState.data.posActiveProducts && AppState.data.posActiveProducts.length > 0;

        if (!hasActiveSession) {
            const container = document.createElement('div');
            container.innerHTML = `
                <div class="page-header">
                    <h2>🌅 Iniciar Día de Ventas</h2>
                    <button class="btn btn-success" onclick="Actions.startPosDay()">Comenzar Venta ▶</button>
                </div>
                <div class="card" style="margin-bottom: 1rem;">
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">Selecciona los productos disponibles para vender hoy:</p>
                    <input type="text" id="pos-search" placeholder="🔍 Buscar producto..." style="width: 100%;" onkeyup="Actions._debouncedFilterPos()" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                </div>
                <div class="pos-setup-list" id="pos-setup-list">
                        ${AppState.data.products.map(p => {
                        const color = p.color || Utils.getColorForProduct(p.name);
                        const pricePerLiter = p.pricePerLiter || 0;
                        
                        return `
                        <label class="pos-checkbox-card" data-product-name="${p.name.toLowerCase()}" onclick="this.classList.toggle('selected', this.querySelector('input').checked)">
                            <input type="checkbox" value="${p.id}">
                            <div style="display: flex; align-items: center; gap: 0.8rem; flex: 1;">
                                <div class="pos-setup-swatch" style="border: 4px solid ${color}; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: transparent;">
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
            // VIEW: ACTIVE POS - Con render parcial (sin Router.navigate en cada click)
            const total = this._calculatePosTotal();

            const container = document.createElement('div');
            container.id = 'pos-active-view';
            container.innerHTML = `
                <div class="pos-total-banner" id="pos-total-banner">
                    <div>
                        <small>Total del Día</small>
                        <h2 id="pos-total-amount">$${total.toFixed(2)}</h2>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <button class="btn pos-undo-btn ${UndoStack.canUndo() ? '' : 'disabled'}" id="pos-undo-btn" onclick="Actions.undoPosAction()" title="Deshacer última acción" ${UndoStack.canUndo() ? '' : 'disabled'}>↩️</button>
                        <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid white;" onclick="Actions.closePosDay()">🌙 Cerrar Día</button>
                    </div>
                </div>
                
                <div class="grid">
                    ${AppState.data.posActiveProducts.map(product => {
                        const presentations = product.presentations || [];
                        const color = product.color || Utils.getColorForProduct(product.name);
                        const pricePerLiter = product.pricePerLiter || 0;
                        
                        return `
                        <div class="card pos-product-card" style="padding: 0.9rem; border: 6px solid ${Utils.hexToRgba(color, 0.32)};" data-product-id="${product.id}">
                            <h4 style="margin-bottom: 0.5rem;">${product.name}</h4>
                            <div>
                                ${presentations.map(p => {
                                    const presPrice = (p.price != null) ? p.price : (pricePerLiter * p.liters);
                                    const price = presPrice.toFixed(2);
                                    const item = AppState.data.posActiveProducts.find(pos => pos.id === product.id);
                                    const presItem = item?.presentationItems?.find(pi => pi.presentationId === p.id);
                                    const count = presItem?.count || 0;
                                    
                                    return `
                                        <div class="pos-pres-item" style="padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem;" data-pres-id="${p.id}">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                                <span style="font-weight: 600;">${p.name}</span>
                                                <span style="color: var(--primary); font-weight: bold;">$${price}</span>
                                            </div>
                                            <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                                                <button class="counter-btn btn-minus" onclick="Actions.updatePosItemCount('${product.id}', ${p.id}, -1)">-</button>
                                                <div class="count-display" id="count-${product.id}-${p.id}">${count}</div>
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

    /** Calcula el total del POS sin re-renderizar */
    _calculatePosTotal() {
        return AppState.data.posActiveProducts.reduce((sum, prod) => {
            const presTotal = (prod.presentationItems || []).reduce((s, pi) => s + ((pi.price || 0) * (pi.count || 0)), 0);
            return sum + presTotal;
        }, 0);
    },

    /** Actualiza solo los elementos DOM afectados en POS (render parcial) */
    _updatePosUI(productId, presentationId) {
        const countEl = document.getElementById(`count-${productId}-${presentationId}`);
        if (countEl) {
            const product = AppState.data.posActiveProducts.find(p => p.id === productId);
            const presItem = product?.presentationItems?.find(pi => pi.presentationId === presentationId);
            countEl.textContent = presItem?.count || 0;
        }

        const totalEl = document.getElementById('pos-total-amount');
        if (totalEl) {
            totalEl.textContent = `$${this._calculatePosTotal().toFixed(2)}`;
        }

        const undoBtn = document.getElementById('pos-undo-btn');
        if (undoBtn) {
            undoBtn.disabled = !UndoStack.canUndo();
            undoBtn.classList.toggle('disabled', !UndoStack.canUndo());
        }
    },

    /** Actualiza todos los contadores del POS (usado tras undo o reset) */
    _updateAllPosUI() {
        AppState.data.posActiveProducts.forEach(product => {
            (product.presentationItems || []).forEach(pi => {
                const countEl = document.getElementById(`count-${product.id}-${pi.presentationId}`);
                if (countEl) countEl.textContent = pi.count || 0;
            });
        });

        const totalEl = document.getElementById('pos-total-amount');
        if (totalEl) {
            totalEl.textContent = `$${this._calculatePosTotal().toFixed(2)}`;
        }

        const undoBtn = document.getElementById('pos-undo-btn');
        if (undoBtn) {
            undoBtn.disabled = !UndoStack.canUndo();
            undoBtn.classList.toggle('disabled', !UndoStack.canUndo());
        }
    },

    sales() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="page-header">
                <h2>📊 Historial de Ventas</h2>
            </div>
            
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

            <!-- Resumen con totales por periodo y top productos -->
            <div id="sales-summary" style="margin-bottom: 1.5rem;">
                ${this._renderSalesSummary(AppState.data.salesHistory || [])}
            </div>

            <div id="sales-results" style="display: flex; flex-direction: column; gap: 1rem;">
                ${this._renderSalesList(AppState.data.salesHistory || [])}
            </div>
        `;
        return container;
    },

    /** Resumen de ventas: totales hoy/semana/mes + top 5 productos */
    _renderSalesSummary(sales) {
        if (!sales || sales.length === 0) return '';

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const totalToday = sales.filter(s => s.date.split('T')[0] === today).reduce((sum, s) => sum + s.totalAmount, 0);
        const totalWeek = sales.filter(s => s.date.split('T')[0] >= weekAgo).reduce((sum, s) => sum + s.totalAmount, 0);
        const totalMonth = sales.filter(s => s.date.split('T')[0] >= monthStart).reduce((sum, s) => sum + s.totalAmount, 0);
        const totalAll = sales.reduce((sum, s) => sum + s.totalAmount, 0);

        // Top 5 productos (por presentación)
        const productCounts = {};
        sales.forEach(s => {
            (s.items || []).forEach(item => {
                const key = `${item.name}${item.presentationName ? ' ' + item.presentationName : ''}`;
                if (!productCounts[key]) productCounts[key] = { name: key, count: 0, total: 0 };
                productCounts[key].count += item.count;
                productCounts[key].total += item.total;
            });
        });
        const topProducts = Object.values(productCounts).sort((a, b) => b.total - a.total).slice(0, 5);

        return `
            <div class="sales-summary-grid">
                <div class="summary-card">
                    <div class="summary-label">📅 Hoy</div>
                    <div class="summary-value">$${totalToday.toFixed(2)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">📆 Semana</div>
                    <div class="summary-value">$${totalWeek.toFixed(2)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">🗓️ Mes</div>
                    <div class="summary-value">$${totalMonth.toFixed(2)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">💰 Total</div>
                    <div class="summary-value">$${totalAll.toFixed(2)}</div>
                </div>
            </div>
            ${topProducts.length > 0 ? `
            <div class="card" style="margin-top: 1rem;">
                <h3 style="margin-bottom: 0.8rem;">🏆 Top Productos</h3>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${topProducts.map((p, i) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; ${i < topProducts.length - 1 ? 'border-bottom: 1px solid #f0f0f0;' : ''}">
                            <div>
                                <span style="font-weight: 600; color: var(--primary);">#${i + 1}</span>
                                <span style="margin-left: 0.5rem;">${p.name}</span>
                                <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 0.3rem;">(${p.count} uds)</span>
                            </div>
                            <strong style="color: var(--success);">$${p.total.toFixed(2)}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;
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
            
            <div style="height: 15vh; min-height: 80px;"></div>
        `;
        container.classList.add('scrollable-view');
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
                        <input type="text" id="filter-keyword" placeholder="Palabra clave..." onkeydown="if(event.key==='Enter'){ this.blur(); Actions.filterExpenses(); }">
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

            <div id="expense-results" class="scrollable-small">
                ${this._renderExpenseList(allExpenses, categories)}
            </div>
        `;
        return container;
    },

    _renderExpenseList(expenses, categories) {
        if (expenses.length === 0) return '<p>No hay gastos registrados.</p>';

        return `<div style="display: flex; flex-direction: column; gap: 1rem;">
            ${expenses.slice().reverse().map(exp => {
            const category = categories.find(c => String(c.id) === String(exp.categoryId))?.name || 'General';
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
                <h2>📁 Datos</h2>
            </div>

            <div class="card" style="margin-bottom: 1.5rem;">
                <h3>🔒 Eliminar datos</h3>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Elimina todos los datos guardados en la aplicación. Esta acción es irreversible.</p>
                <button class="btn btn-danger" onclick="Actions.openDeleteDataModal()">🗑️ Eliminar todos los datos</button>
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

    renderModal(title, contentHtml) {
        const existing = document.querySelector('.modal-overlay');
        if (existing) this.closeModal(existing);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="Views.closeModal()">×</button>
                </div>
                <div class="modal-body">
                    ${contentHtml}
                </div>
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
        document.body.appendChild(modal);
    },

    closeModal(modalElement) {
        const modal = modalElement || document.querySelector('.modal-overlay');
        if (!modal) return;
        
        modal.classList.add('modal-closing');
        const content = modal.querySelector('.modal-content');
        if (content) content.classList.add('modal-content-closing');
        
        setTimeout(() => { modal.remove(); }, 200);
    }
};

// --- ACTIONS (Controller Helpers) ---
const Actions = {
    // Debounced filter para búsqueda POS (150ms)
    _debouncedFilterPos: Utils.debounce(() => {
        Actions.filterPosProducts();
    }, 150),

    openProductModal(productId = null) {
        const product = productId ? AppState.data.products.find(p => p.id === productId) : null;
        const title = product ? 'Editar Agua' : 'Nuevo Agua';
        
        const colors = ['#FFFFFF','#6C5CE7','#5A3FD9','#A29BFE','#6C63FF','#0984E3','#74B9FF','#74C0FC','#00CEC9','#00A8A8','#55EFC4','#00B894','#00A36C','#FD79A8','#E84393','#FF6B6B','#FF7675','#D63031','#FF6348','#FDCB6E','#FFEAA7','#E17055','#E67E22','#FF9F1C','#B2BEC3','#636E72','#2D3436','#1E272E'];
        const selectedColor = product?.color || colors[0];
        
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
                    <div class="presentations-grid">
                        ${presentations.map(pres => {
                            const isSelected = productPresentations.some(pp => pp.id === pres.id);
                            const selectedEntry = productPresentations.find(pp => pp.id === pres.id) || {};
                            const customPrice = selectedEntry.price || '';
                            return `
                                <label class="presentation-item ${isSelected ? 'selected' : ''}">
                                    <div class="presentation-checkbox">
                                        <input type="checkbox" name="presentation" value="${pres.id}" ${isSelected ? 'checked' : ''} onchange="Actions.updatePresentationSelection()">
                                    </div>
                                    <div class="presentation-info">
                                        <div class="presentation-name">${pres.name}</div>
                                        <div class="presentation-liters">${pres.liters}L</div>
                                    </div>
                                    <div class="presentation-price-input">
                                        <input type="number" name="presentation_price_${pres.id}" step="0.01" placeholder="Precio" value="${customPrice}" onchange="Actions.updatePresentationSelection()" class="price-field" />
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <input type="hidden" name="presentations" id="presentations-data" value='${JSON.stringify(productPresentations)}'>
                </div>
                
                <div class="form-group">
                    <label>Color del Producto</label>
                    <div class="color-combobox">
                        <button type="button" class="color-combobox-toggle" onclick="Actions.toggleColorDropdown(this)">
                            <span class="color-preview" style="background-color: ${selectedColor}; border: 2px solid rgba(0,0,0,0.08);"></span>
                        </button>
                        <div class="color-dropdown-panel" style="display: none; margin-top: 0.6rem;">
                            <div class="color-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(48px, 1fr)); gap: 0.6rem;">
                                ${colors.map(color => `
                                    <button type="button" class="color-picker-btn ${selectedColor === color ? 'selected' : ''}" onclick="Actions.selectProductColor('${color}', this); Actions.toggleColorDropdown(this.closest('.color-dropdown-panel').previousElementSibling)" style="background-color: ${color};" title="${color}" aria-label="Seleccionar color ${color}"></button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <input type="hidden" name="color" id="product-color" value="${selectedColor}">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid #ccc" onclick="Views.closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-success">Guardar</button>
                </div>
            </form>
        `;

        Views.renderModal(title, formHtml);
    },

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

    selectProductColor(color, element) {
        document.querySelectorAll('.color-picker-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        const hidden = document.getElementById('product-color');
        if (hidden) hidden.value = color;

        const preview = document.querySelector('.color-combobox .color-preview');
        if (preview) preview.style.backgroundColor = color;
        const comboText = document.querySelector('.color-combobox .color-combobox-text');
        if (comboText) comboText.textContent = color;
        const contrast = Utils.getContrastColor(color);
        if (comboText) comboText.style.color = contrast;
        
        const panel = document.querySelector('.color-dropdown-panel');
        if (panel) panel.style.display = 'none';
    },

    toggleColorDropdown(btn) {
        if (!btn) return;
        const combobox = btn.closest('.color-combobox');
        if (!combobox) return;
        const panel = combobox.querySelector('.color-dropdown-panel');
        if (!panel) return;
        panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
    },

    saveProduct(id) {
        const form = document.getElementById('product-form');
        const formData = new FormData(form);
        const name = (formData.get('name') || '').trim();
        const pricePerLiter = parseFloat(formData.get('pricePerLiter'));
        const color = formData.get('color');
        const presentations = JSON.parse(formData.get('presentations') || '[]');

        if (!name) {
            alert('El nombre del producto no puede estar vacío.');
            return;
        }

        const normalized = name.toLowerCase();
        const duplicate = (AppState.data.products || []).find(p => (p.name || '').trim().toLowerCase() === normalized && p.id !== id);
        if (duplicate) {
            alert('Ya existe un producto con ese nombre. Usa un nombre distinto.');
            return;
        }

        if (presentations.length === 0) {
            alert('Por favor selecciona al menos una presentación');
            return;
        }

        const now = new Date().toISOString();

        if (id) {
            const index = AppState.data.products.findIndex(p => p.id === id);
            if (index !== -1) {
                AppState.data.products[index] = { 
                    ...AppState.data.products[index], 
                    name, 
                    pricePerLiter, 
                    color,
                    presentations,
                    updatedAt: now,
                };
            }
        } else {
            const newProduct = {
                id: Utils.generateId(),
                name,
                pricePerLiter,
                color,
                presentations,
                category: 'default',
                createdAt: now,
                updatedAt: now,
            };
            AppState.data.products.push(newProduct);
        }

        Storage.save();
        Views.closeModal();
        Router.navigate('inventory');
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

        UndoStack.clear();

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
     * Actualiza la cantidad de un producto en una presentación específica.
     * Usa render parcial: NO re-renderiza toda la vista.
     */
    updatePosItemCount(productId, presentationId, delta) {
        const product = AppState.data.posActiveProducts.find(p => p.id === productId);
        if (product) {
            const presItem = product.presentationItems.find(pi => pi.presentationId === presentationId);
            if (presItem) {
                const newCount = presItem.count + delta;
                if (newCount >= 0) {
                    UndoStack.push();
                    presItem.count = newCount;
                    Storage.save();
                    Views._updatePosUI(productId, presentationId);
                }
            }
        }
    },

    /** Deshace la última acción en el POS */
    undoPosAction() {
        const snapshot = UndoStack.pop();
        if (snapshot) {
            AppState.data.posActiveProducts = snapshot;
            Storage.save();
            Views._updateAllPosUI();
        }
    },

    /** Reinicia todos los contadores de un producto a 0 */
    resetProductCounts(productId) {
        const product = AppState.data.posActiveProducts.find(p => p.id === productId);
        if (product && product.presentationItems) {
            const hasAny = product.presentationItems.some(pi => pi.count > 0);
            if (!hasAny) return;
            
            UndoStack.push();
            product.presentationItems.forEach(pi => { pi.count = 0; });
            Storage.save();
            Views._updateAllPosUI();
        }
    },

    /** Reinicia el contador de una presentación específica a 0 */
    resetPresentationCount(productId, presentationId) {
        const product = AppState.data.posActiveProducts.find(p => p.id === productId);
        if (product) {
            const presItem = product.presentationItems.find(pi => pi.presentationId === presentationId);
            if (presItem && presItem.count > 0) {
                UndoStack.push();
                presItem.count = 0;
                Storage.save();
                Views._updatePosUI(productId, presentationId);
            }
        }
    },

    updatePosCount(id, delta) {
        const item = AppState.data.posActiveProducts.find(p => p.id === id);
        if (item) {
            const newCount = item.count + delta;
            if (newCount >= 0) {
                UndoStack.push();
                item.count = newCount;
                Storage.save();
                Router.navigate('pos');
            }
        }
    },

    filterPosProducts() {
        const searchTerm = document.getElementById('pos-search')?.value.toLowerCase() || '';
        const productCards = document.querySelectorAll('#pos-setup-list .pos-checkbox-card');
        
        productCards.forEach(card => {
            const productName = card.getAttribute('data-product-name');
            card.style.display = productName.includes(searchTerm) ? '' : 'none';
        });
    },

    closePosDay() {
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

        if (items.length > 0) {
            const proceed = confirm(`¿Deseas cerrar las ventas del día?\nTotal: $${totalAmount.toFixed(2)}\nArtículos: ${items.length}`);
            if (!proceed) return;
        }

        const record = {
            id: Utils.generateId(),
            date: new Date().toISOString(),
            totalAmount: totalAmount,
            items: items
        };

        if (!AppState.data.salesHistory) AppState.data.salesHistory = [];
        AppState.data.salesHistory.push(record);

        AppState.data.posActiveProducts = [];
        UndoStack.clear();

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
                            <span onclick="Actions.deleteCategory('${c.id}')" style="cursor: pointer; margin-left: 0.5rem; color: var(--danger); font-weight: bold;">×</span>
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
        Views.renderModal('Gestionar Categorías', html);
    },

    addCategory(name) {
        if (!AppState.data.expenseCategories) AppState.data.expenseCategories = [];
        AppState.data.expenseCategories.push({ 
            id: Utils.generateId(), 
            name, 
            createdAt: new Date().toISOString() 
        });
        Storage.save();
        alert('Categoría agregada exitosamente');
        Actions.openCategoryModal();
    },

    deleteCategory(id) {
        if (confirm('Eliminar categoría?')) {
            AppState.data.expenseCategories = AppState.data.expenseCategories.filter(c => String(c.id) !== String(id));
            Storage.save();
            Actions.openCategoryModal();
        }
    },

    // --- PRESENTATIONS (Tamaños) ---
    openPresentationsModal(adminOnly = false) {
        const presentations = AppState.data.presentations || [];
        const listHtml = presentations.map(p => {
            const isProtected = p.isProtected === true;
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.5rem 0; border-bottom:1px solid #f0f0f0;">
                <div style="display:flex; gap:0.6rem; align-items:center;">
                    <div>
                        <strong>${p.name}</strong>${isProtected ? ' <span style="font-size:0.7rem; color: var(--primary);">🔒</span>' : ''}
                        <div style="font-size:0.85rem; color:var(--text-muted);">${p.liters} L</div>
                    </div>
                </div>
                ${adminOnly ? `<div style="display:flex; gap:0.5rem;">
                    <button class="btn" onclick="Actions.editPresentation(${p.id})">✏️</button>
                    ${isProtected 
                        ? '<button class="btn btn-danger" disabled title="Presentación base protegida" style="opacity: 0.4; cursor: not-allowed;">🔒</button>' 
                        : `<button class="btn btn-danger" onclick="Actions.deletePresentation(${p.id})">🗑️</button>`
                    }
                </div>` : ''}
            </div>
        `}).join('');

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
                        <button class="btn" type="button" onclick="Views.closeModal()">Cerrar</button>
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
        const newId = AppState.data.presentations.length ? Math.max(...AppState.data.presentations.map(p => typeof p.id === 'number' ? p.id : 0)) + 1 : 1;
        AppState.data.presentations.push({ 
            id: newId, 
            name, 
            liters, 
            createdAt: new Date().toISOString() 
        });
        Storage.save();
        Actions.openPresentationsModal(true);
    },

    deletePresentation(id) {
        const pres = (AppState.data.presentations || []).find(p => p.id === id);
        if (pres && pres.isProtected) {
            alert('❌ Esta presentación base (500ml, 1L) no se puede eliminar.');
            return;
        }

        if (!confirm('Eliminar presentación? Esto también quitará la presentación de productos existentes.')) return;
        AppState.data.presentations = (AppState.data.presentations || []).filter(p => p.id !== id);

        AppState.data.products = (AppState.data.products || []).map(prod => ({
            ...prod,
            presentations: (prod.presentations || []).filter(pr => pr.id !== id),
            updatedAt: new Date().toISOString(),
        }));

        Storage.save();
        Actions.openPresentationsModal(true);
    },

    editPresentation(id) {
        const pres = (AppState.data.presentations || []).find(p => p.id === id);
        if (!pres) return alert('Presentación no encontrada');

        const isProtected = pres.isProtected === true;
        const warningHtml = isProtected 
            ? `<div style="background: rgba(253, 121, 168, 0.1); border: 1px solid var(--accent); padding: 0.6rem; border-radius: 8px; margin-bottom: 0.8rem; font-size: 0.85rem;">
                ⚠️ Presentación base. Si cambias los litros, los precios calculados de todos los productos que la usen se actualizarán.
               </div>` 
            : '';

        const html = `
            <form id="presentation-edit-form" onsubmit="event.preventDefault(); Actions.saveEditedPresentation(${id})">
                ${warningHtml}
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
        const oldPres = (AppState.data.presentations || []).find(p => p.id === id);
        const litersChanged = oldPres && oldPres.liters !== liters;

        AppState.data.presentations = (AppState.data.presentations || []).map(p => p.id === id ? { ...p, name, liters, updatedAt: new Date().toISOString() } : p);
        
        // Actualizar referencia en productos
        AppState.data.products = (AppState.data.products || []).map(prod => ({
            ...prod,
            presentations: (prod.presentations || []).map(pp => pp.id === id ? { ...pp, name, liters } : pp),
            updatedAt: new Date().toISOString(),
        }));

        Storage.save();

        if (litersChanged) {
            alert('⚠️ Se cambió el tamaño. Los precios calculados (precio/L × litros) se actualizarán automáticamente.');
        }

        Actions.openPresentationsModal(true);
    },

    saveExpense(form) {
        const formData = new FormData(form);
        const expense = {
            id: Utils.generateId(),
            date: new Date().toISOString(),
            categoryId: formData.get('categoryId'),
            amount: formData.get('amount'),
            description: formData.get('description'),
            createdAt: new Date().toISOString(),
        };

        if (!AppState.data.expenses) AppState.data.expenses = [];
        AppState.data.expenses.push(expense);
        Storage.save();
        alert('Gasto guardado en el reporte de gastos');
        Router.navigate('expenses');
    },

    deleteExpense(id) {
        if (confirm('Eliminar registro de gasto?')) {
            AppState.data.expenses = AppState.data.expenses.filter(e => e.id !== id);
            Storage.save();
            Router.navigate('expenses');
        }
    },

    openDeleteDataModal() {
        const html = `
            <p style="color: var(--text-muted);">Esta acción eliminará todos los productos, ventas, gastos y configuraciones guardadas localmente. Es irreversible.</p>
            <p>Escribe la palabra <strong>Ornitorinco</strong> para confirmar:</p>
            <input id="confirm-delete-input" type="text" placeholder="Palabra de confirmación" style="width: 100%; padding: 0.6rem; margin-bottom: 0.8rem;" />
            <div style="display:flex; gap:0.5rem; justify-content: flex-end;">
                <button class="btn" type="button" onclick="Views.closeModal()">Cancelar</button>
                <button class="btn btn-danger" type="button" onclick="Actions.deleteAllData()">Eliminar</button>
            </div>
        `;
        Views.renderModal('Eliminar todos los datos', html);
    },

    deleteAllData() {
        const input = document.getElementById('confirm-delete-input');
        const val = input ? input.value.trim() : '';
        if (val !== 'Ornitorinco') {
            alert('La palabra de confirmación no coincide. Escribe Ornitorinco para confirmar.');
            return;
        }

        if (!confirm('¿Estás seguro? Esta acción eliminará permanentemente todos los datos.')) return;

        try { localStorage.removeItem(Storage.KEY); } catch (e) {}

        AppState.data = { dataVersion: 2, products: [], salesHistory: [], expenses: [], expenseCategories: [], presentations: [], posActiveProducts: [] };
        Storage.save();
        Storage.load();
        UndoStack.clear();
        Views.closeModal();
        alert('Todos los datos han sido eliminados.');
        Router.navigate('inventory');
    },

    // --- FILTERS & REPORTS ---
    filterSales() {
        const from = document.getElementById('sales-date-from').value;
        const to = document.getElementById('sales-date-to').value;

        let filtered = AppState.data.salesHistory || [];

        if (from && to) {
            if (new Date(to) < new Date(from)) {
                alert('La fecha final no puede ser anterior a la fecha inicial.');
                return;
            }
        }

        if (from) filtered = filtered.filter(s => s.date.split('T')[0] >= from);
        if (to) filtered = filtered.filter(s => s.date.split('T')[0] <= to);

        // Actualizar resumen y lista
        const summaryEl = document.getElementById('sales-summary');
        if (summaryEl) summaryEl.innerHTML = Views._renderSalesSummary(filtered);
        document.getElementById('sales-results').innerHTML = Views._renderSalesList(filtered);
    },

    filterExpenses() {
        const from = document.getElementById('filter-date-from').value;
        const to = document.getElementById('filter-date-to').value;
        const keyword = document.getElementById('filter-keyword').value.toLowerCase();

        let filtered = AppState.data.expenses || [];

        if (from && to) {
            if (new Date(to) < new Date(from)) {
                alert('La fecha final no puede ser anterior a la fecha inicial.');
                return;
            }
        }

        if (from) filtered = filtered.filter(e => e.date.split('T')[0] >= from);
        if (to) filtered = filtered.filter(e => e.date.split('T')[0] <= to);
        if (keyword) {
            filtered = filtered.filter(e =>
                (e.description && e.description.toLowerCase().includes(keyword)) ||
                (AppState.data.expenseCategories.find(c => String(c.id) === String(e.categoryId))?.name || '').toLowerCase().includes(keyword)
            );
        }

        document.getElementById('expense-results').innerHTML = Views._renderExpenseList(filtered, AppState.data.expenseCategories);
    },

    generateReport(type, format) {
        let data = [];
        let headers = [];
        let rows = [];
        let title = '';
        let dateRange = '';
        let fileDateRange = new Date().toISOString().split('T')[0];

        if (type === 'sales') {
            title = 'Reporte de Ventas - Detallado por Producto';
            const from = document.getElementById('sales-date-from').value;
            const to = document.getElementById('sales-date-to').value;

            let filtered = AppState.data.salesHistory || [];

            if (from && to && new Date(to) < new Date(from)) {
                alert('La fecha final no puede ser anterior a la fecha inicial.');
                return;
            }

            if (from) filtered = filtered.filter(s => s.date.split('T')[0] >= from);
            if (to) filtered = filtered.filter(s => s.date.split('T')[0] <= to);

            data = filtered;

            let minDate = null, maxDate = null;
            data.forEach(s => {
                const d = new Date(s.date);
                if (!minDate || d < minDate) minDate = d;
                if (!maxDate || d > maxDate) maxDate = d;
            });

            const fromLabel = from || (minDate ? minDate.toLocaleDateString() : new Date().toLocaleDateString());
            const toLabel = to || (maxDate ? maxDate.toLocaleDateString() : new Date().toLocaleDateString());
            dateRange = `Desde: ${fromLabel} - Hasta: ${toLabel}`;
            const fromISO = from || (minDate ? minDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            const toISO = to || (maxDate ? maxDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            fileDateRange = `${fromISO}_${toISO}`;
            
            // Desglose por producto Y presentación (evita mezcla de 500ml y 1L al mismo precio)
            let productsData = {};
            let totalVentas = 0;
            let totalProductos = 0;
            
            data.forEach(sale => {
                sale.items.forEach(item => {
                    const product = AppState.data.products.find(p => (
                        (item.productId && p.id === item.productId) ||
                        (p.name && p.name.trim().toLowerCase() === (item.name || '').trim().toLowerCase())
                    ));
                    const productStatus = product ? 'Activo' : 'DESCONTINUADO';
                    const presName = item.presentationName || '';
                    const key = `${item.name}|${presName}|${item.price}|${productStatus}`;
                    
                    if (!productsData[key]) {
                        productsData[key] = {
                            name: item.name,
                            presentation: presName,
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
            
            headers = [['Producto', 'Presentación', 'Precio Unit.', 'Cantidad', 'Total Vendido', 'Estado']];
            rows = Object.values(productsData).map(p => [
                p.name,
                p.presentation || '-',
                `$${p.price.toFixed(2)}`,
                `${p.quantity} unidades`,
                `$${p.total.toFixed(2)}`,
                p.status
            ]);
            
            rows.push(['', '', '', '', '', '']);
            rows.push(['TOTALES', '', '', `${totalProductos} unidades`, `$${totalVentas.toFixed(2)}`, '']);
        } else if (type === 'expenses') {
            title = 'Reporte de Gastos';
            const from = document.getElementById('filter-date-from').value;
            const to = document.getElementById('filter-date-to').value;
            const keyword = document.getElementById('filter-keyword').value.toLowerCase();

            let filtered = AppState.data.expenses || [];

            if (from && to && new Date(to) < new Date(from)) {
                alert('La fecha final no puede ser anterior a la fecha inicial.');
                return;
            }

            if (from) filtered = filtered.filter(e => e.date.split('T')[0] >= from);
            if (to) filtered = filtered.filter(e => e.date.split('T')[0] <= to);
            if (keyword) filtered = filtered.filter(e =>
                (e.description && e.description.toLowerCase().includes(keyword)) ||
                (AppState.data.expenseCategories.find(c => String(c.id) === String(e.categoryId))?.name || '').toLowerCase().includes(keyword)
            );

            data = filtered;

            let minDateE = null, maxDateE = null;
            data.forEach(exp => {
                const d = new Date(exp.date);
                if (!minDateE || d < minDateE) minDateE = d;
                if (!maxDateE || d > maxDateE) maxDateE = d;
            });

            const fromLabelE = from || (minDateE ? minDateE.toLocaleDateString() : new Date().toLocaleDateString());
            const toLabelE = to || (maxDateE ? maxDateE.toLocaleDateString() : new Date().toLocaleDateString());
            dateRange = `Desde: ${fromLabelE} - Hasta: ${toLabelE}`;
            const fromISOE = from || (minDateE ? minDateE.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            const toISOE = to || (maxDateE ? maxDateE.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            fileDateRange = `${fromISOE}_${toISOE}`;
            headers = [['Fecha', 'Categoría', 'Descripción', 'Monto']];
            rows = data.map(exp => [
                new Date(exp.date).toLocaleDateString(),
                AppState.data.expenseCategories.find(c => String(c.id) === String(exp.categoryId))?.name || 'General',
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
                headStyles: { fillColor: [108, 92, 231] },
                bodyStyles: { textColor: [45, 52, 54] },
                alternateRowStyles: { fillColor: [244, 247, 246] }
            });

            doc.save(`${title.replace(/ /g, '_')}_${fileDateRange}.pdf`);
        } else if (format === 'excel') {
            if (!window.XLSX) { alert('Librería Excel no cargada. Verifica tu conexión.'); return; }

            const wb = XLSX.utils.book_new();
            const wsData = [headers[0], ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            XLSX.utils.book_append_sheet(wb, ws, "Reporte");
            XLSX.writeFile(wb, `${title.replace(/ /g, '_')}_${fileDateRange}.xlsx`);
        }
    }
};

// Confirmación al salir de la aplicación
let requireExitConfirmation = true;

window.addEventListener('beforeunload', (e) => {
    if (!requireExitConfirmation) return;
    e.preventDefault();
    e.returnValue = '';
});

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    Router.init();
});
