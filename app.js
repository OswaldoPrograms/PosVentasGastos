/**
 * GEMINI POS - Core Application Logic
 * Vanilla JS implementation
 */

// --- STATE MANAGEMENT ---
const AppState = {
    view: 'inventory',
    data: {
        products: [],
        salesHistory: [],
        expenses: [],
        expenseCategories: [],
        // POS Setup
        posActiveProducts: [], // [{ productId, initialStockIfAny, soldCount }]
    }
};

// --- UTILITY FUNCTIONS ---
const Utils = {
    getColorForProduct(name) {
        const colors = ['#6C5CE7', '#00CEC9', '#FD79A8', '#FDCB6E', '#E17055', '#74B9FF', '#A29BFE', '#55EFC4'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    },
    getPlaceholderImage(name) {
        const initial = name.charAt(0).toUpperCase();
        const color = this.getColorForProduct(name);
        return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="60" fill="white" font-weight="bold">${initial}</text></svg>`)}`;
    }
};

// --- STORAGE SERVICE ---
const Storage = {
    KEY: 'gemini_pos_data',
    save() {
        localStorage.setItem(this.KEY, JSON.stringify(AppState.data));
    },
    load() {
        const stored = localStorage.getItem(this.KEY);
        if (stored) {
            AppState.data = { ...AppState.data, ...JSON.parse(stored) };
        } else {
            // Seeding default data for demo
            AppState.data.expenseCategories = [
                { id: 1, name: 'Mercancia' },
                { id: 2, name: 'Sueldos' },
                { id: 3, name: 'Servicios' }
            ];
            this.save();
        }
    },
    exportData() {
        const dataStr = JSON.stringify(AppState.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gemini_pos_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    },
    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                AppState.data = imported;
                this.save();
                alert('✅ Datos importados correctamente');
                Router.navigate(AppState.view); // Refresh current view
            } catch (error) {
                alert('❌ Error al importar el archivo. Verifica que sea un archivo válido.');
            }
        };
        reader.readAsText(file);
    }
};

// --- ROUTER & VIEW RENDERING ---
const Router = {
    init() {
        // Navigation Click Listeners
        document.querySelectorAll('.nav-links li').forEach(el => {
            el.addEventListener('click', (e) => {
                const view = el.dataset.view;
                this.navigate(view);
            });
        });

        // Load Data
        Storage.load();

        // Initial Render
        this.navigate('inventory');
    },

    navigate(viewName) {
        AppState.view = viewName;

        // Update Nav UI
        document.querySelectorAll('.nav-links li').forEach(el => {
            if (el.dataset.view === viewName) el.classList.add('active');
            else el.classList.remove('active');
        });

        // Render Content
        const main = document.getElementById('main-content');
        main.innerHTML = ''; // Clear current

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
            case 'expenses': // Legacy redirect
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
                <button class="btn" onclick="Actions.openProductModal()">+ Agregar Producto</button>
            </div>
            <div class="grid" id="product-grid">
                ${AppState.data.products.length ? AppState.data.products.map(p => this._renderProductCard(p)).join('') : '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No hay productos. Agrega uno nuevo.</p>'}
            </div>
        `;
        return container;
    },

    _renderProductCard(product) {
        const imageSrc = product.image || Utils.getPlaceholderImage(product.name);
        return `
            <div class="card product-card">
                <img src="${imageSrc}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>$${parseFloat(product.price).toFixed(2)}</p>
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
                    <p style="color: var(--text-muted);">Selecciona los productos disponibles para vender hoy:</p>
                </div>
                <div class="pos-setup-list" id="pos-setup-list">
                    ${AppState.data.products.map(p => `
                        <label class="pos-checkbox-card" onclick="this.classList.toggle('selected', this.querySelector('input').checked)">
                            <input type="checkbox" value="${p.id}">
                            <div>
                                <strong>${p.name}</strong>
                                <div style="font-size: 0.8rem; color: var(--text-muted)">$${p.price}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            `;
            return container;
        } else {
            // VIEW: ACTIVE POS
            const total = AppState.data.posActiveProducts.reduce((sum, item) => sum + (item.count * item.price), 0);

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
                    ${AppState.data.posActiveProducts.map(item => `
                        <div class="card product-card">
                            <img src="${item.image || 'https://via.placeholder.com/150'}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/150'">
                            <h3>${item.name}</h3>
                            <p>$${item.price}</p>
                            <div class="counter-controls">
                                <button class="counter-btn btn-minus" onclick="Actions.updatePosCount('${item.id}', -1)">-</button>
                                <div class="count-display">${item.count}</div>
                                <button class="counter-btn btn-plus" onclick="Actions.updatePosCount('${item.id}', 1)">+</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            return container;
        }
    },

    sales() {
        const container = document.createElement('div');
        const history = AppState.data.salesHistory || [];
        container.innerHTML = `
            <div class="page-header">
                <h2>📊 Historial de Ventas</h2>
            </div>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${history.length === 0 ? '<p>No hay ventas registradas.</p>' : history.slice().reverse().map(sale => `
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <strong>${new Date(sale.date).toLocaleDateString()} ${new Date(sale.date).toLocaleTimeString()}</strong>
                            <strong style="color: var(--success);">$${sale.totalAmount.toFixed(2)}</strong>
                        </div>
                        <ul style="list-style: none; font-size: 0.9rem; color: var(--text-muted);">
                            ${sale.items.map(i => `<li>${i.count}x ${i.name} ($${i.total.toFixed(2)})</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;
        return container;
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
                <button class="btn" onclick="Actions.filterExpenses()">Aplicar Filtros</button>
                <button class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid #ccc; margin-left: 0.5rem;" onclick="Router.navigate('view-expenses')">Limpiar</button>
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
        const title = product ? 'Editar Producto' : 'Nuevo Producto';

        const formHtml = `
            <form id="product-form" onsubmit="event.preventDefault(); Actions.saveProduct('${productId || ''}')">
                <div class="form-group">
                    <label>Nombre del Producto</label>
                    <input type="text" name="name" value="${product ? product.name : ''}" required placeholder="Ej. Nieve de Limón">
                </div>
                <div class="form-group">
                    <label>Precio ($)</label>
                    <input type="number" name="price" value="${product ? product.price : ''}" step="0.5" required placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Imagen</label>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <button type="button" class="btn" style="flex: 1; padding: 0.5rem;" onclick="document.getElementById('image-file-input').click()">📁 Subir Imagen</button>
                        <button type="button" class="btn" style="flex: 1; padding: 0.5rem; background: var(--secondary);" onclick="document.getElementById('image-url-toggle').style.display='block'">🔗 Usar URL</button>
                    </div>
                    <input type="file" id="image-file-input" accept="image/*" style="display: none;" onchange="Actions.handleImageUpload(event)">
                    <input type="url" id="image-url-toggle" name="imageUrl" value="${product && product.image && !product.image.startsWith('data:') ? product.image : ''}" placeholder="https://..." style="display: none;">
                    <input type="hidden" name="image" id="image-data" value="${product ? product.image : ''}">
                    <div id="image-preview" style="margin-top: 0.5rem; text-align: center;">
                        ${product && product.image ? `<img src="${product.image}" style="max-width: 150px; max-height: 150px; border-radius: 8px;">` : ''}
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid #ccc" onclick="document.querySelector('.modal-overlay').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-success">Guardar</button>
                </div>
            </form>
        `;

        Views.renderModal(title, formHtml);
    },

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                document.getElementById('image-data').value = base64;
                document.getElementById('image-preview').innerHTML = `<img src="${base64}" style="max-width: 150px; max-height: 150px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        }
    },

    saveProduct(id) {
        const form = document.getElementById('product-form');
        const formData = new FormData(form);
        const name = formData.get('name');
        const price = parseFloat(formData.get('price'));
        const imageUrl = formData.get('imageUrl');
        const imageData = formData.get('image');

        // Prefer uploaded image (Base64), fallback to URL
        const image = imageData || imageUrl || '';

        if (id) {
            // Edit
            const index = AppState.data.products.findIndex(p => p.id === id);
            if (index !== -1) {
                AppState.data.products[index] = { ...AppState.data.products[index], name, price, image };
            }
        } else {
            // Create
            const newProduct = {
                id: Date.now().toString(),
                name,
                price,
                image,
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
            .map(p => ({ ...p, count: 0 })); // Init with 0 sold

        Storage.save();
        Router.navigate('pos');
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

    closePosDay() {
        // Calculate totals
        const itemsSold = AppState.data.posActiveProducts.filter(p => p.count > 0);

        if (itemsSold.length === 0 && !confirm('No has vendido nada. ¿Quieres cerrar el día de todos modos?')) {
            return;
        }

        const totalAmount = itemsSold.reduce((sum, item) => sum + (item.count * item.price), 0);

        const record = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            totalAmount: totalAmount,
            items: itemsSold.map(p => ({
                name: p.name,
                price: p.price,
                count: p.count,
                total: p.count * p.price
            }))
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
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    Router.init();
});
