// import-cordoba.js — regenera productos.js desde el Listado de Stock Básico de Córdoba Software
// Uso: node import-cordoba.js "ruta/al/archivo.xlsx"

const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const EXCEL_FILE  = process.argv[2] || path.join(__dirname, 'Hoja de cálculo sin título.xlsx');
const OUTPUT_FILE = path.join(__dirname, 'productos.js');

// ── Prefijos de SKU por sector ──────────────────────────────
const PREFIJOS_VINOS   = ['01','11','12','13','14','15','16','17','18','19'];
const PREFIJOS_SPIRITS = ['02','03','04','05','07','08'];

// ── Proveedores a excluir ───────────────────────────────────
const PROVEEDORES_EXCLUIR = new Set([
  'Bienes','Bienes de uso','Cheques','Compensaciones','Cristaleria',
  'Del Valle','Excepciones','Gastos Bancarios','Insumos Limpieza',
  'Logistica','Personal','Productos Discontinuados','Puro Tabaco',
  'Repuestos Rodados','XXX',
]);

// ── Cargar proveedor existente desde productos.js actual ────
let proveedorPorSku = {};
let proveedorPorPrefijo6 = {};
try {
  const { PRODUCTOS_VINOS, PRODUCTOS_SPIRITS } = require('./productos.js');
  [...PRODUCTOS_VINOS, ...PRODUCTOS_SPIRITS].forEach(p => {
    proveedorPorSku[p.sku] = p.proveedor;
    const pre6 = p.sku.slice(0, 6);
    if (!proveedorPorPrefijo6[pre6]) proveedorPorPrefijo6[pre6] = p.proveedor;
  });
  console.log(`Proveedores cargados desde productos.js: ${Object.keys(proveedorPorSku).length} SKUs`);
} catch (e) {
  console.warn('No se pudo leer productos.js actual — proveedores quedarán vacíos');
}

function inferirProveedor(sku) {
  if (proveedorPorSku[sku]) return proveedorPorSku[sku];
  // Buscar por prefijo de 6 dígitos
  const pre6 = sku.slice(0, 6);
  if (proveedorPorPrefijo6[pre6]) return proveedorPorPrefijo6[pre6];
  // Buscar por prefijo de 4 dígitos
  const pre4 = sku.slice(0, 4);
  const match = Object.entries(proveedorPorPrefijo6).find(([k]) => k.startsWith(pre4));
  if (match) return match[1];
  return '';
}

function clasificar(sku) {
  const pre = sku.slice(0, 2);
  if (PREFIJOS_VINOS.includes(pre))   return 'vinos';
  if (PREFIJOS_SPIRITS.includes(pre)) return 'spirits';
  return null;
}

// ── Leer Excel de Córdoba Software ─────────────────────────
console.log(`Leyendo: ${EXCEL_FILE}`);
const wb   = xlsx.readFile(EXCEL_FILE);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Detectar fila de inicio (primera fila con SKU numérico ≥ 7 dígitos)
let startRow = 4;
for (let i = 0; i < Math.min(10, rows.length); i++) {
  const cell = String(rows[i][0]).trim().replace(/\D/g, '');
  if (cell.length >= 7) { startRow = i; break; }
}

const vinos   = [];
const spirits = [];
let omitidos  = 0;

rows.slice(startRow).forEach(row => {
  const skuRaw  = String(row[0]).trim().replace(/\D/g, '').padStart(8, '0');
  const articulo = String(row[1]).trim();
  const stock_sistema = parseFloat(String(row[2]).replace(',', '.')) || 0;

  if (!/^\d{8}$/.test(skuRaw) || !articulo) { omitidos++; return; }

  const sector = clasificar(skuRaw);
  if (!sector) { omitidos++; return; }

  const proveedor = inferirProveedor(skuRaw);

  // Excluir si el proveedor conocido está en la lista de exclusión
  if (proveedor && PROVEEDORES_EXCLUIR.has(proveedor)) { omitidos++; return; }

  const producto = { sku: skuRaw, proveedor, articulo, stock_sistema };
  if (sector === 'vinos')   vinos.push(producto);
  else                      spirits.push(producto);
});

// ── Serializar ──────────────────────────────────────────────
function serializarArray(nombre, arr) {
  const items = arr.map(p => {
    const sku  = JSON.stringify(p.sku);
    const prov = JSON.stringify(p.proveedor);
    const art  = JSON.stringify(p.articulo);
    const ss   = p.stock_sistema;
    return `  { sku: ${sku.padEnd(14)}, proveedor: ${prov.padEnd(50)}, articulo: ${art.padEnd(60)}, stock_sistema: ${ss} }`;
  });
  return `const ${nombre} = [\n${items.join(',\n')},\n];`;
}

const nombreArchivo = path.basename(EXCEL_FILE);
const contenido = `// productos.js — generado automáticamente por import-cordoba.js
// Fuente: ${nombreArchivo}  (${new Date().toLocaleString('es-AR')})
// VINOS: ${vinos.length} productos | SPIRITS: ${spirits.length} productos

${serializarArray('PRODUCTOS_VINOS', vinos)}

${serializarArray('PRODUCTOS_SPIRITS', spirits)}

if (typeof module !== 'undefined') module.exports = { PRODUCTOS_VINOS, PRODUCTOS_SPIRITS };
`;

fs.writeFileSync(OUTPUT_FILE, contenido, 'utf8');

console.log('');
console.log('✓ productos.js generado');
console.log(`  PRODUCTOS_VINOS   : ${vinos.length.toString().padStart(5)} productos`);
console.log(`  PRODUCTOS_SPIRITS : ${spirits.length.toString().padStart(5)} productos`);
console.log(`  Omitidos          : ${omitidos.toString().padStart(5)} filas`);
console.log(`  Total             : ${(vinos.length + spirits.length).toString().padStart(5)}`);
console.log('');
