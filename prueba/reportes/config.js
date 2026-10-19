// ============================================================
//  REPORTES · PLATAFORMA DE PRUEBA DE JOAQUÍN
//  Copia de la página de Reportes del equipo, con su propia planilla:
//  nada de lo que se cargue acá se mezcla con los reportes reales.
// ============================================================

window.IDEAMIA_CONFIG = {

  // Los reportes van al Apps Script del panel, que los guarda en la planilla de prueba.
  WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbwCxld4KNBsNMSGGluIA138f1vaKBo2TnqMIXsO2Y8iV87k4d7NUic47-MpvEgYehZJ/exec?prueba=reportes",

  // Lectura de capturas con IA: se toma de la pestaña Config de la planilla de prueba (UPLOAD_URL).
  UPLOAD_URL: "",

  // Sin borradores en la nube: los reportes a medio hacer se guardan solo en este dispositivo.
  DRAFTS_URL: "",

  // Los reportes de prueba se guardan en la pestaña "Reportes prueba" de la planilla del panel y se leen por acá.
  PRUEBA_API: "https://script.google.com/macros/s/AKfycbwCxld4KNBsNMSGGluIA138f1vaKBo2TnqMIXsO2Y8iV87k4d7NUic47-MpvEgYehZJ/exec",
  SHEET_ID: "panel",
  SHEET_TAB: "Sheet1",

  PANEL_PASSWORD: "",

  DEADLINE: { cm: { dia: 1, hora: 12 }, sm: { dia: 2, hora: 12 } },
  DEADLINE_HOUR: 12,
  MONTHLY_DEADLINE_DAY: 5,
  PERIODICO_DESDE: "2026-07",
  SEMANAL_DESDE: "2026-10-12",
  MENSUAL_DESDE: "2026-09",

  RESPONSABLES: {
    joaco: { nombre: "Joaquín (prueba)", rol: "Social Media" }
  },

  MARCAS: [
    { slug: "tritato-prueba", nombre: "Tritato Prueba", sm: "joaco", cm: "", canal: true }
  ]
};
