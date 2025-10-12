import fs from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extraerPDF(ruta) {
  try {
    const data = await fs.readFile(ruta);
    const arrayBuffer = new Uint8Array(data);
    
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    }).promise;
    
    let textoCompleto = "";
    
    for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
      const pagina = await pdf.getPage(numPagina);
      const contenido = await pagina.getTextContent();
      
      const textoPagina = contenido.items
        .map(item => item.str)
        .join(" ");
      
      textoCompleto += textoPagina + "\n\n";
    }
    
    return textoCompleto.trim();
  } catch (error) {
    throw new Error(`Error al extraer texto del PDF: ${error.message}`);
  }
}