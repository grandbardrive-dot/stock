// import-excel.js — genera productos.js desde STOCK 05-06-26.xlsx

const xlsx = require('xlsx');
const fs   = require('fs');
const path = require('path');

const EXCEL_FILE   = path.join(__dirname, 'STOCK 05-06-26.xlsx');
const OUTPUT_FILE  = path.join(__dirname, 'productos.js');

// ── Prefijos de SKU por sector ──────────────────────────────
const PREFIJOS_VINOS   = ['01','11','12','13','14','15','16','17','18','19'];
const PREFIJOS_SPIRITS = ['02','03','04','05','07','08'];
const PREFIJOS_EXCLUIR = ['30','31','40','60','90','91','92'];

// ── Leer Excel ───────────────────────────────────────────────
const wb   = xlsx.readFile(EXCEL_FILE);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

// Fila 0 es encabezado → saltar
const datos = rows.slice(1);

function clasificar(skuRaw) {
  const sku = String(skuRaw).trim();
  const pre = sku.slice(0, 2);
  if (PREFIJOS_EXCLUIR.includes(pre)) return null;
  if (PREFIJOS_VINOS.includes(pre))   return 'vinos';
  if (PREFIJOS_SPIRITS.includes(pre)) return 'spirits';
  return null;
}

const vinos   = [];
const spirits = [];
let   omitidos = 0;

datos.forEach(row => {
  const proveedor = String(row[0] ?? '').trim();
  const sku       = String(row[1] ?? '').trim();
  const articulo  = String(row[2] ?? '').trim();

  if (!sku || !articulo) { omitidos++; return; }

  const sector = clasificar(sku);
  if (!sector) { omitidos++; return; }

  const producto = { sku, proveedor, articulo };
  if (sector === 'vinos')   vinos.push(producto);
  else                      spirits.push(producto);
});

// ── Serializar como JS literal alineado ─────────────────────
function serializarArray(nombre, arr) {
  const items = arr.map(p => {
    const sku  = JSON.stringify(p.sku);
    const prov = JSON.stringify(p.proveedor);
    const art  = JSON.stringify(p.articulo);
    return `  { sku: ${sku.padEnd(14)}, proveedor: ${prov.padEnd(50)}, articulo: ${art} }`;
  });
  return `const ${nombre} = [\n${items.join(',\n')},\n];`;
}

const contenido = `// productos.js — generado automáticamente por import-excel.js
// Fuente: STOCK 05-06-26.xlsx  (${new Date().toLocaleString('es-AR')})
// VINOS: ${vinos.length} productos | SPIRITS: ${spirits.length} productos

${serializarArray('PRODUCTOS_VINOS', vinos)}

${serializarArray('PRODUCTOS_SPIRITS', spirits)}

// Carga desde localStorage si hay ediciones del panel admin
function cargarProductos() {
  const vinosLS   = localStorage.getItem('grandbar_vinos');
  const spiritsLS = localStorage.getItem('grandbar_spirits');
  return {
    vinos:   vinosLS   ? JSON.parse(vinosLS)   : PRODUCTOS_VINOS,
    spirits: spiritsLS ? JSON.parse(spiritsLS) : PRODUCTOS_SPIRITS,
  };
}

if (typeof module !== 'undefined') module.exports = { PRODUCTOS_VINOS, PRODUCTOS_SPIRITS };
`;

fs.writeFileSync(OUTPUT_FILE, contenido, 'utf8');

// ── Reporte ──────────────────────────────────────────────────
console.log('');
console.log('✓ productos.js generado');
console.log(`  PRODUCTOS_VINOS   : ${vinos.length.toString().padStart(5)} productos`);
console.log(`  PRODUCTOS_SPIRITS : ${spirits.length.toString().padStart(5)} productos`);
console.log(`  Omitidos          : ${omitidos.toString().padStart(5)} filas (excluidos o sin datos)`);
console.log(`  Total procesados  : ${(vinos.length + spirits.length).toString().padStart(5)}`);
console.log('');
