/**
 * app.js — Sistema de Inventario Plásticos La 15
 * Versión estática con localStorage — lista para GitHub Pages
 * Sin servidor, sin base de datos, sin instalaciones.
 */

// ══════════════════════════════════════════════
// Motor de datos — localStorage
// ══════════════════════════════════════════════
const DB = {
    KEYS: {
        PRODUCTOS: 'pcl15_productos',
        MOVIMIENTOS: 'pcl15_movimientos',
        INITIALIZED: 'pcl15_initialized',
        LAST_BACKUP: 'pcl15_last_backup'
    },

    getProductos() {
        return JSON.parse(localStorage.getItem(this.KEYS.PRODUCTOS) || '[]');
    },
    setProductos(data) {
        localStorage.setItem(this.KEYS.PRODUCTOS, JSON.stringify(data));
    },
    getMovimientos() {
        return JSON.parse(localStorage.getItem(this.KEYS.MOVIMIENTOS) || '[]');
    },
    setMovimientos(data) {
        localStorage.setItem(this.KEYS.MOVIMIENTOS, JSON.stringify(data));
    },
    isInitialized() {
        return localStorage.getItem(this.KEYS.INITIALIZED) === 'true';
    },
    setInitialized() {
        localStorage.setItem(this.KEYS.INITIALIZED, 'true');
    },

    // ── Inicializar desde JSON si es primera vez ──
    async initialize() {
        if (this.isInitialized()) {
            console.log('✅ Datos existentes cargados desde localStorage');
            return;
        }
        try {
            const res = await fetch('data/productos.json');
            const productos = await res.json();
            this.setProductos(productos);
            this.setMovimientos([]);
            this.setInitialized();
            console.log(`✅ ${productos.length} productos importados del catálogo`);
        } catch (err) {
            console.error('❌ Error cargando catálogo:', err);
            // Si no puede cargar el JSON, inicializar vacío
            if (!this.getProductos().length) {
                this.setProductos([]);
                this.setMovimientos([]);
            }
        }
    },

    // ── Registrar movimiento ──
    registrarMovimiento(productoId, tipo, cantidad, remision, cliente, proveedor, observaciones) {
        const productos = this.getProductos();
        const producto = productos.find(p => p.id === productoId);

        if (!producto) return { ok: false, error: 'Producto no encontrado' };

        if (tipo === 'SALIDA') {
            if (cantidad > producto.stock_actual) {
                return {
                    ok: false,
                    error: `Stock insuficiente. Disponible: ${producto.stock_actual}, Solicitado: ${cantidad}`
                };
            }
            producto.stock_actual = Math.round((producto.stock_actual - cantidad) * 100) / 100;
        } else {
            producto.stock_actual = Math.round((producto.stock_actual + cantidad) * 100) / 100;
        }

        this.setProductos(productos);

        // Registrar en historial
        const movimientos = this.getMovimientos();
        movimientos.unshift({
            id: Date.now(),
            producto_id: productoId,
            referencia: producto.referencia,
            categoria: producto.categoria,
            medida: producto.medida,
            tipo: tipo,
            cantidad: cantidad,
            remision: remision || null,
            cliente: cliente || null,
            proveedor: proveedor || null,
            observaciones: observaciones || null,
            usuario: 'Admin',
            fecha: new Date().toISOString()
        });
        this.setMovimientos(movimientos);

        return { ok: true, nuevo_stock: producto.stock_actual };
    },

    // ── Actualizar producto ──
    updateProducto(productoId, field, value) {
        const productos = this.getProductos();
        const p = productos.find(pr => pr.id === productoId);
        if (p) {
            p[field] = parseFloat(value) || 0;
            this.setProductos(productos);
            return true;
        }
        return false;
    },

    // ── Stats ──
    getStats() {
        const productos = this.getProductos();
        const hoy = new Date().toISOString().slice(0, 10);
        const movimientos = this.getMovimientos();

        const total = productos.filter(p => p.activo !== false).length;
        const alerta_bajo = productos.filter(p => p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo).length;
        const alerta_alto = productos.filter(p => p.stock_maximo > 0 && p.stock_actual >= p.stock_maximo).length;
        const stock_ok = total - alerta_bajo - alerta_alto;
        const mov_hoy = movimientos.filter(m => m.fecha && m.fecha.slice(0, 10) === hoy).length;

        return { total_productos: total, alerta_bajo, alerta_alto, stock_ok, movimientos_hoy: mov_hoy };
    },

    // ── Categorías únicas ──
    getCategorias() {
        const productos = this.getProductos();
        return [...new Set(productos.map(p => p.categoria))].sort();
    },

    // ── Exportar todo (backup) ──
    exportBackup() {
        const data = {
            version: '1.0',
            fecha: new Date().toISOString(),
            productos: this.getProductos(),
            movimientos: this.getMovimientos()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        localStorage.setItem(this.KEYS.LAST_BACKUP, new Date().toISOString());
    },

    // ── Importar backup ──
    importBackup(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (!data.productos || !Array.isArray(data.productos)) {
                throw new Error('Formato inválido: falta array de productos');
            }
            this.setProductos(data.productos);
            if (data.movimientos) this.setMovimientos(data.movimientos);
            this.setInitialized();
            return { ok: true, count: data.productos.length };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    getLastBackup() {
        return localStorage.getItem(this.KEYS.LAST_BACKUP);
    }
};


// ══════════════════════════════════════════════
// Estado de la app
// ══════════════════════════════════════════════
const state = {
    currentView: 'dashboard',
    filters: {
        categoria: '',
        busqueda: '',
        movTipo: '',
        movBusqueda: '',
        movFechaDesde: '',
        movFechaHasta: '',
        movPage: 0,
        movPerPage: 30
    },
    selectedProducto: null
};


// ══════════════════════════════════════════════
// Inicialización
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await DB.initialize();
    renderDashboard();
    setupNavigation();
    setupModalEvents();
    setupSearchDebounce();
    updateBackupInfo();
});

function renderDashboard() {
    renderStats();
    renderCategoriaFilter();
    renderProductosTable();
    renderAlerts();
    updateAlertBadge();
}


// ══════════════════════════════════════════════
// Navegación SPA
// ══════════════════════════════════════════════
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
}

function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');

    if (view === 'historial') renderMovimientosTable();
    else if (view === 'dashboard') renderDashboard();
}


// ══════════════════════════════════════════════
// Dashboard: Stats
// ══════════════════════════════════════════════
function renderStats() {
    const s = DB.getStats();
    document.getElementById('stat-total').textContent = s.total_productos;
    document.getElementById('stat-ok').textContent = s.stock_ok;
    document.getElementById('stat-bajo').textContent = s.alerta_bajo;
    document.getElementById('stat-alto').textContent = s.alerta_alto;
    document.getElementById('stat-mov-hoy').textContent = s.movimientos_hoy;
}

function renderAlerts() {
    const productos = DB.getProductos();
    const alertas = productos.filter(p =>
        (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) ||
        (p.stock_maximo > 0 && p.stock_actual >= p.stock_maximo)
    );
    const panel = document.getElementById('alerts-panel');
    if (alertas.length === 0) { panel.classList.remove('show'); return; }

    panel.classList.add('show');
    document.getElementById('alerts-list').innerHTML = alertas.slice(0, 5).map(p => {
        const isBajo = p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo;
        return `<div class="alert-item">
            <span>${isBajo ? '🔴' : '🟠'}</span>
            <strong>${esc(p.referencia)}</strong>
            <span class="cat-badge">${esc(p.categoria)}</span>
            <span>— Stock: ${p.stock_actual} ${p.unidad}</span>
            <span>(${isBajo ? 'Mín: ' + p.stock_minimo : 'Máx: ' + p.stock_maximo})</span>
        </div>`;
    }).join('') + (alertas.length > 5 ? `<div class="alert-item" style="color:var(--text-muted)">...y ${alertas.length - 5} más</div>` : '');
}

function updateAlertBadge() {
    const count = DB.getStats().alerta_bajo;
    const badge = document.getElementById('alert-badge');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
}


// ══════════════════════════════════════════════
// Dashboard: Categoría filter
// ══════════════════════════════════════════════
function renderCategoriaFilter() {
    const select = document.getElementById('filter-categoria');
    const cats = DB.getCategorias();
    select.innerHTML = '<option value="">Todas las categorías</option>' +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}


// ══════════════════════════════════════════════
// Dashboard: Tabla de productos
// ══════════════════════════════════════════════
function renderProductosTable() {
    let productos = DB.getProductos().filter(p => p.activo !== false);
    if (state.filters.categoria) productos = productos.filter(p => p.categoria === state.filters.categoria);
    if (state.filters.busqueda) {
        const q = state.filters.busqueda.toLowerCase();
        productos = productos.filter(p =>
            p.referencia.toLowerCase().includes(q) ||
            (p.medida && p.medida.toLowerCase().includes(q)) ||
            p.categoria.toLowerCase().includes(q)
        );
    }

    const tbody = document.getElementById('productos-tbody');
    if (productos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><p>No se encontraron productos</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = productos.map(p => `
        <tr>
            <td class="ref">${esc(p.referencia)}</td>
            <td><span class="cat-badge">${esc(p.categoria)}</span></td>
            <td class="hide-tablet">${esc(p.medida || '—')}</td>
            <td class="hide-tablet">${esc(p.calibre || '—')}</td>
            <td class="stock-val" style="color:${getStockColor(p)}">${p.stock_actual}</td>
            <td class="hide-tablet"><div class="inline-edit"><input type="number" value="${p.stock_minimo}" min="0" step="1" onchange="updateProductField(${p.id},'stock_minimo',this.value)" title="Stock Mínimo"></div></td>
            <td class="hide-tablet"><div class="inline-edit"><input type="number" value="${p.stock_maximo}" min="0" step="1" onchange="updateProductField(${p.id},'stock_maximo',this.value)" title="Stock Máximo"></div></td>
            <td>${renderStatusBadge(p)}</td>
        </tr>
    `).join('');
}

function getStockColor(p) {
    if (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) return 'var(--color-danger)';
    if (p.stock_maximo > 0 && p.stock_actual >= p.stock_maximo) return 'var(--color-overstock)';
    if (p.stock_actual > 0) return 'var(--color-ok)';
    return 'var(--text-muted)';
}

function renderStatusBadge(p) {
    if (p.stock_minimo === 0 && p.stock_maximo === 0) return '<span class="status-badge neutral">⚪ Sin límites</span>';
    if (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) return '<span class="status-badge danger">🔴 Stock bajo</span>';
    if (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo * 1.2) return '<span class="status-badge warning">🟡 Precaución</span>';
    if (p.stock_maximo > 0 && p.stock_actual >= p.stock_maximo) return '<span class="status-badge overstock">🟠 Sobre-stock</span>';
    return '<span class="status-badge ok">🟢 Normal</span>';
}


// ══════════════════════════════════════════════
// Historial: Tabla de movimientos
// ══════════════════════════════════════════════
function renderMovimientosTable() {
    let movimientos = DB.getMovimientos();

    // Filtros
    if (state.filters.movTipo) movimientos = movimientos.filter(m => m.tipo === state.filters.movTipo);
    if (state.filters.movBusqueda) {
        const q = state.filters.movBusqueda.toLowerCase();
        movimientos = movimientos.filter(m =>
            (m.referencia && m.referencia.toLowerCase().includes(q)) ||
            (m.remision && m.remision.toLowerCase().includes(q)) ||
            (m.cliente && m.cliente.toLowerCase().includes(q))
        );
    }
    if (state.filters.movFechaDesde) movimientos = movimientos.filter(m => m.fecha && m.fecha.slice(0, 10) >= state.filters.movFechaDesde);
    if (state.filters.movFechaHasta) movimientos = movimientos.filter(m => m.fecha && m.fecha.slice(0, 10) <= state.filters.movFechaHasta);

    const total = movimientos.length;
    const pages = Math.ceil(total / state.filters.movPerPage);
    const start = state.filters.movPage * state.filters.movPerPage;
    const paged = movimientos.slice(start, start + state.filters.movPerPage);

    const tbody = document.getElementById('movimientos-tbody');
    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>No se encontraron movimientos</p></div></td></tr>`;
        document.getElementById('mov-pagination').style.display = 'none';
        return;
    }

    tbody.innerHTML = paged.map(m => `
        <tr>
            <td>${formatDate(m.fecha)}</td>
            <td><span class="tipo-badge ${m.tipo.toLowerCase()}">${m.tipo === 'ENTRADA' ? '📥' : '📤'} ${m.tipo}</span></td>
            <td class="ref">${esc(m.referencia)}</td>
            <td><span class="cat-badge">${esc(m.categoria)}</span></td>
            <td class="stock-val">${m.cantidad}</td>
            <td>${esc(m.remision || '—')}</td>
            <td class="hide-tablet">${esc(m.cliente || m.proveedor || '—')}</td>
            <td class="hide-tablet">${esc(m.usuario || 'Admin')}</td>
        </tr>
    `).join('');

    const pag = document.getElementById('mov-pagination');
    if (pages > 1) {
        pag.style.display = 'flex';
        document.getElementById('page-info').textContent = `Página ${state.filters.movPage + 1} de ${pages} (${total} registros)`;
        document.getElementById('btn-prev').disabled = state.filters.movPage <= 0;
        document.getElementById('btn-next').disabled = state.filters.movPage >= pages - 1;
    } else {
        pag.style.display = 'none';
    }
}


// ══════════════════════════════════════════════
// Modales
// ══════════════════════════════════════════════
function setupModalEvents() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeAllModals(); });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
    setupAutocomplete('mov-producto-search', 'mov-autocomplete-list', selectProductForMovement);
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    state.selectedProducto = null;
}

function openMovimientoModal(tipo) {
    state.selectedProducto = null;
    document.getElementById('mov-tipo').value = tipo;
    document.getElementById('mov-form').reset();
    document.getElementById('mov-stock-info').style.display = 'none';
    document.getElementById('remision-label').innerHTML = tipo === 'SALIDA'
        ? 'Nº Remisión <span class="required">*</span>' : 'Nº Remisión';
    document.getElementById('contacto-label').textContent = tipo === 'SALIDA' ? 'Cliente (opcional)' : 'Proveedor (opcional)';
    document.getElementById('mov-modal-title').innerHTML = tipo === 'ENTRADA' ? '📥 Registrar Entrada' : '📤 Registrar Salida';
    const btn = document.getElementById('mov-submit-btn');
    btn.className = tipo === 'ENTRADA' ? 'btn btn-entrada' : 'btn btn-salida';
    btn.innerHTML = tipo === 'ENTRADA' ? '📥 Registrar Entrada' : '📤 Registrar Salida';
    openModal('modal-movimiento');
    setTimeout(() => document.getElementById('mov-producto-search').focus(), 100);
}


// ══════════════════════════════════════════════
// Autocomplete
// ══════════════════════════════════════════════
function setupAutocomplete(inputId, listId, onSelect) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let selectedIdx = -1;

    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 1) { list.classList.remove('show'); return; }
        const productos = DB.getProductos();
        const matches = productos.filter(p =>
            p.referencia.toLowerCase().includes(q) ||
            (p.medida && p.medida.toLowerCase().includes(q)) ||
            p.categoria.toLowerCase().includes(q)
        ).slice(0, 10);

        if (matches.length === 0) { list.classList.remove('show'); return; }
        selectedIdx = -1;
        list.innerHTML = matches.map((p, i) => `
            <div class="autocomplete-item" data-idx="${i}" data-id="${p.id}">
                <span class="ac-ref">${esc(p.referencia)}</span>
                <span class="ac-cat">${esc(p.categoria)}</span>
                <span class="ac-stock">Stock: ${p.stock_actual}</span>
            </div>
        `).join('');
        list.classList.add('show');
        list.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const prod = productos.find(p => p.id === parseInt(item.dataset.id));
                if (prod) onSelect(prod);
                list.classList.remove('show');
            });
        });
    });

    input.addEventListener('keydown', e => {
        const items = list.querySelectorAll('.autocomplete-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); items.forEach((it, i) => it.classList.toggle('selected', i === selectedIdx)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); items.forEach((it, i) => it.classList.toggle('selected', i === selectedIdx)); }
        else if (e.key === 'Enter' && selectedIdx >= 0) { e.preventDefault(); items[selectedIdx].click(); }
    });
    document.addEventListener('click', e => { if (!input.contains(e.target) && !list.contains(e.target)) list.classList.remove('show'); });
}

function selectProductForMovement(producto) {
    state.selectedProducto = producto;
    document.getElementById('mov-producto-search').value = `${producto.referencia} — ${producto.categoria}`;
    document.getElementById('mov-producto-id').value = producto.id;
    document.getElementById('mov-stock-info').style.display = 'flex';
    document.getElementById('mov-stock-display').textContent = `${producto.stock_actual} ${producto.unidad}`;
}


// ══════════════════════════════════════════════
// Registrar movimiento
// ══════════════════════════════════════════════
function submitMovimiento(e) {
    e.preventDefault();
    const productoId = parseInt(document.getElementById('mov-producto-id').value);
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseFloat(document.getElementById('mov-cantidad').value);
    const remision = document.getElementById('mov-remision').value.trim();
    const contacto = document.getElementById('mov-contacto').value.trim();
    const observaciones = document.getElementById('mov-observaciones').value.trim();

    if (!productoId) { showToast('Selecciona un producto', 'error'); return; }
    if (!cantidad || cantidad <= 0) { showToast('La cantidad debe ser mayor a 0', 'error'); return; }
    if (tipo === 'SALIDA' && !remision) { showToast('El Nº de remisión es obligatorio para salidas', 'error'); return; }

    const result = DB.registrarMovimiento(
        productoId, tipo, cantidad, remision,
        tipo === 'SALIDA' ? contacto : null,
        tipo === 'ENTRADA' ? contacto : null,
        observaciones
    );

    if (result.ok) {
        showToast(`${tipo === 'ENTRADA' ? '📥' : '📤'} Registrado — Nuevo stock: ${result.nuevo_stock}`, 'success');
        closeAllModals();
        renderDashboard();
    } else {
        showToast(result.error, 'error');
    }
}


// ══════════════════════════════════════════════
// Editar producto inline
// ══════════════════════════════════════════════
function updateProductField(productoId, field, value) {
    DB.updateProducto(productoId, field, value);
    showToast(`${field === 'stock_minimo' ? 'Mínimo' : 'Máximo'} actualizado`, 'success');
    renderDashboard();
}


// ══════════════════════════════════════════════
// Filtros
// ══════════════════════════════════════════════
function setupSearchDebounce() {
    let timeout;
    const el = document.getElementById('search-input');
    if (el) el.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(() => { state.filters.busqueda = el.value; renderProductosTable(); }, 200); });
}

function filterByCategoria(value) { state.filters.categoria = value; renderProductosTable(); }

function filterMovimientos() {
    state.filters.movTipo = document.getElementById('mov-filter-tipo')?.value || '';
    state.filters.movBusqueda = document.getElementById('mov-filter-busqueda')?.value || '';
    state.filters.movFechaDesde = document.getElementById('mov-filter-desde')?.value || '';
    state.filters.movFechaHasta = document.getElementById('mov-filter-hasta')?.value || '';
    state.filters.movPage = 0;
    renderMovimientosTable();
}

function movPagPrev() { state.filters.movPage = Math.max(0, state.filters.movPage - 1); renderMovimientosTable(); }
function movPagNext() { state.filters.movPage++; renderMovimientosTable(); }


// ══════════════════════════════════════════════
// Backup / Restaurar
// ══════════════════════════════════════════════
function exportarBackup() {
    DB.exportBackup();
    showToast('💾 Backup descargado', 'success');
    updateBackupInfo();
}

function importarBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = DB.importBackup(ev.target.result);
            if (result.ok) {
                showToast(`✅ Backup restaurado: ${result.count} productos`, 'success');
                renderDashboard();
                updateBackupInfo();
            } else {
                showToast('❌ Error: ' + result.error, 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function updateBackupInfo() {
    const last = DB.getLastBackup();
    const el = document.getElementById('last-backup-date');
    if (el) {
        el.textContent = last ? formatDate(last) : 'Nunca';
    }
}

function resetearDatos() {
    if (confirm('⚠️ ¿Estás seguro? Esto borrará TODOS los datos de inventario y movimientos.\n\nSe recomienda hacer un backup primero.')) {
        if (confirm('🔴 CONFIRMAR: Se perderán todos los datos. ¿Continuar?')) {
            localStorage.removeItem(DB.KEYS.PRODUCTOS);
            localStorage.removeItem(DB.KEYS.MOVIMIENTOS);
            localStorage.removeItem(DB.KEYS.INITIALIZED);
            localStorage.removeItem(DB.KEYS.LAST_BACKUP);
            location.reload();
        }
    }
}


// ══════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}


// ══════════════════════════════════════════════
// Utilidades
// ══════════════════════════════════════════════
function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return dateStr; }
}
