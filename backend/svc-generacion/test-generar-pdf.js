import fs from 'node:fs';
import { generarPDFEstudiantes } from './src/generadores/pdf.generador.js';

(async () => {
  try {
    console.log('🔄 Generando PDF de estudiantes de 6A...');

    const buffer = await generarPDFEstudiantes('6A', 1);

    const rutaSalida = './test-estudiantes-6A.pdf';
    fs.writeFileSync(rutaSalida, buffer);

    console.log(`✅ PDF generado exitosamente: ${rutaSalida}`);
    console.log(`📊 Tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
    console.log('\n📝 Abre el archivo PDF para verificar que los datos se muestran correctamente');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
