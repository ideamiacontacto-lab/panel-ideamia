# Panel diario · Ideamia — cómo ponerlo en marcha

Son unos 20 minutos, una sola vez. Al final, el equipo entra a una web y ve qué tiene que hacer hoy.

```
Trello (sigue siendo el centro) ─┐
Google Calendar de Ideamia ──────┼─▶ Apps Script (dentro del Sheet) ─▶ web en GitHub Pages
Claude (recomendaciones) ────────┘        │
                                          └─▶ pestaña "Registro" = lo que tildó cada uno (la ve el project)
```

## 1. El Sheet y el Apps Script (5 min)

1. Con la cuenta **ideamia.contacto**, creá un Google Sheet nuevo: **Panel Social Media Ideamia**.
2. Andá a *Extensiones → Apps Script*. Borrá lo que haya y pegá todo `apps-script/Code.gs`.
3. En el engranaje (*Configuración del proyecto*), activá **Mostrar el archivo de manifiesto "appsscript.json"**. Abrilo y reemplazalo por `apps-script/appsscript.json`.
4. Guardá, volvé al Sheet y recargalo. Aparece el menú **Panel Ideamia**.
5. *Panel Ideamia → 1 · Crear pestañas*. Google te va a pedir permisos (Sheet, Calendar, Drive, conexiones externas). Aceptalos: son de tu propia cuenta.

Se crean las pestañas **Config, Equipo, Marcas, Rutinas, Reuniones y Registro**, ya cargadas con lo que tienen hoy: Orne con Isco, GV, Skilful, Tritato y Vice; Rama con Quality, Quality Mayorista, Upper, 1tal y DyB; Ale como CM.

## 2. Claves (5 min)

**Trello.** Entrá a https://trello.com/power-ups/admin → *Nuevo* (nombre "Panel Ideamia", workspace Ideamia) → *API key → Generar*. Copiá la **API key**. Al lado está el link **Token**: abrilo, aceptá y copiá el token. Pide permiso de lectura y escritura; la escritura sirve solo para el botón "Ya no lo necesito", que archiva la tarjeta.

**Claude.** Usá la misma API key que tiene el escenario de Make de los reportes, o creá una en https://console.anthropic.com.

Después: *Panel Ideamia → 2 · Cargar claves*. Pega cada clave cuando te la pida y además definí:
- **Clave del equipo**: la que van a escribir Orne, Rama y Ale al entrar.
- **Clave del project**: solo para tu vista.

Las claves quedan guardadas en las propiedades del script. No están en el Sheet ni en la web.

Por último: *Panel Ideamia → 3 · Actualizar Trello e IA ahora*. La primera vez tarda 1 o 2 minutos. Desde ahí se actualiza solo cada hora.

## 3. Publicar el Apps Script (2 min)

En Apps Script: *Implementar → Nueva implementación → Aplicación web*.
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario**

Copiá la URL que termina en `/exec`.

## 4. La web (5 min)

1. En `sitio/config.js`, pegá la URL en `API_URL`.
2. En GitHub (cuenta ideamiacontacto-lab), creá un repo nuevo **panel-ideamia** y subí los archivos de `sitio/`: `index.html`, `app.js`, `styles.css`, `config.js` y `demo.js`.
3. En el repo, andá a *Settings → Pages → Branch: main → Save*. Queda en `https://ideamiacontacto-lab.github.io/panel-ideamia/`.

Links para pasarle a cada uno (la primera vez piden la clave del equipo):
- Orne: `…/panel-ideamia/?p=orne`
- Rama: `…/panel-ideamia/?p=rama`
- Ale: `…/panel-ideamia/?p=ale`
- Vos: `…/panel-ideamia/?vista=project`

## Cómo se ajusta sin tocar código

| Querés… | Dónde |
|---|---|
| Cambiar qué marcas tiene cada uno | Sheet → **Marcas** (columnas sm / cm) |
| Darle contexto a la IA sobre una marca ("pastelería en Paraná, público familiar") | Sheet → **Marcas**, última columna |
| Agregar o cambiar un chequeo semanal | Sheet → **Rutinas** |
| Cambiar cuándo es la reunión con Ads o sumar otra | Sheet → **Reuniones** |
| Ver qué hizo cada uno | Sheet → **Registro**, o la web con `?vista=project` |
| Cada cuántos días vuelve a preguntar por un input | Sheet → **Config** → `INPUT_RECORDATORIO_DIAS` |

Cómo escribir "cuándo": `diaria` · `semana:lun` (desde el lunes, toda la semana) · `mes:1-5` · `mes:10-20` · `mes:ultima-semana` · `meses:1,4,7,10/1-10` (solo esos meses).

## De dónde sale cada cosa

- **Inputs**: listas "INPUTS / PEDIDOS DEL CLIENTE" de cada SCL, más las tarjetas del tablero Project que nombran la marca.
- **Correcciones**: listas "Correcciones".
- **Próximas a vencer**: tarjetas con fecha en los próximos 3 días, menos las que ya están en Publicado, Aprobado, Programado o Terminados.
- **Efemérides**: listas "Efemerides / Calendario Anual". La fecha de la tarjeta es la fecha de la efeméride.
- **Recursos y fichas**: listas "Recursos Corporativos" y "Fichas tecnicas", con sus adjuntos.
- **Cobertura del calendario**: la fecha más lejana con contenido en SCL y CM de cada marca, contra el objetivo de un mes adelante.
- **Entregas y reuniones**: Google Calendar de ideamia.contacto, sin los eventos de finanzas (Config → `CAL_EXCLUIR`).

## Costo de la IA

Lee cada tarjeta nueva o modificada una sola vez: inputs, brainstorming, efemérides de los próximos 30 días y pedidos del Project. Analiza hasta 12 por hora (`IA_MAX_POR_CORRIDA`). Cada lectura cuesta unos centavos de dólar con Claude Opus 5.5 en esfuerzo bajo. El "Plan del día" se arma solo cuando alguien toca el botón, y se guarda 6 horas.
