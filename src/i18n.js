// Interface text in Spanish and English. The language switch in the drawer sets
// both the interface and the names printed on the tokens.
//
// Static text in index.html: data-i18n="key" sets textContent, and
// data-i18n-attr="placeholder:key aria-label:key" sets attributes.

const plural = (n, one, many) => (n === 1 ? one : many);

const STR = {
  es: {
    // gate
    "gate.signedOut.title": "Imprime los personajes de tu grimorio",
    "gate.signedOut.text": "Diseña tokens con forma de moneda para tu grupo, en español o inglés. Gíralos en 3D y descarga los STL para tu impresora. Por ahora, Midnight Mint funciona solo con invitación.",
    "gate.signIn": "Entrar con Google",
    "gate.signInFailed": ({ message }) => `No se pudo entrar: ${message}`,
    "gate.opening": "Abriendo el grimorio…",
    "gate.notInvited.title": "Todavía no estás en la lista",
    "gate.notInvited.text": ({ admin, email }) => `Midnight Mint funciona solo con invitación mientras esperamos la respuesta de The Pandemonium Institute. Pide a ${admin} que invite a ${email} y vuelve a entrar.`,
    "gate.signOut": "Cerrar sesión",
    "gate.empty.title": "La biblioteca está vacía",
    "gate.empty.text": "Sube roles_data.json (en admin-data/) para añadir los 181 personajes.",
    "gate.empty.open": "Abrir biblioteca e invitaciones",
    "gate.settingUp.title": "Estamos preparando la biblioteca",
    "gate.settingUp.text": "Aún no hay personajes. Vuelve a intentarlo dentro de un rato.",
    "gate.error.title": "No se pudo abrir el grimorio",
    "gate.error.text": ({ message }) => `${message}. Revisa tu conexión y recarga la página.`,
    "gate.reload": "Recargar",

    // stage
    "view.aria": "El token en 3D. Arrástralo para girarlo.",
    "view.group": "Vista",
    "view.angle": "Ángulo",
    "view.front": "Frente",
    "view.back": "Reverso",
    "lang.group": "Idioma",
    "me.aria": "Tu cuenta",
    "me.admin": "Biblioteca e invitaciones",
    "me.signOut": "Cerrar sesión",

    // drawer sections
    "sec.saved": "Mis tokens",
    "sec.queue": "Cola de impresión",
    "sec.name": "Nombre",
    "sec.reminders": "Recordatorios",
    "sec.frame": "Marco",
    "sec.back": "Reverso",
    "sec.coin": "Moneda",

    // name
    "name.aria": "Nombre en el token",
    "name.hint": ({ arc, mm, shrunk, small }) => `${arc}° del borde, letras de ${mm} mm${shrunk ? " (reducidas para que quepan)" : ""}.${small ? " Pequeñas para una boquilla de 0,4 mm." : ""}`,
    "range.textSize": "Altura de letra",
    "range.spacing": "Espaciado",
    "range.maxArc": "Arco máximo",
    "range.frameWidth": "Grosor",
    "range.diameter": "Diámetro",
    "range.height": "Grosor de la moneda",
    "range.depth": "Profundidad de las incrustaciones",
    "range.iconScale": "Tamaño del icono",

    // reminders
    "reminders.none": "ninguno",
    "reminders.noneHint": "Este personaje no usa recordatorios.",
    "reminders.tapHint": "Toca uno para verlo.",
    "reminders.previewHint": "Vista previa del recordatorio. Tócalo otra vez para volver al personaje.",
    "reminders.size": ({ mm }) => `Moneda de ${mm} mm.`,
    "reminders.small": ({ mm }) => ` El más largo queda con letras de ${mm} mm, pequeño para imprimir.`,
    "reminders.add": "Añadir estos recordatorios a imprimir",
    "reminders.added": ({ n, name }) => `${plural(n, "Añadido 1 recordatorio", `Añadidos ${n} recordatorios`)} de «${name}» a la cola de impresión.`,

    // frame, back, filaments
    "frame.none": "Ninguno",
    "frame.rim": "Borde",
    "frame.double": "Doble borde",
    "frame.clock": "Marcas de reloj",
    "frame.beads": "Perlas",
    "back.none": "Liso",
    "back.edition": "Edición",
    "back.seal": "Sello del campanario",
    "back.clock": "Esfera de reloj",
    "back.rings": "Anillos",
    "back.name": "Nombre del personaje",
    "back.custom": "Tu SVG",
    "frame.aria": "Filamento del marco",
    "back.aria": "Filamento del reverso",
    "upload.aria": "Tu patrón SVG",
    "upload.tooBig": ({ file, kb, max }) => `${file} pesa ${kb} KB. Usa un SVG de menos de ${max} KB.`,
    "upload.using": ({ file }) => `Usando ${file}. Elige «Tu SVG» otra vez para cambiarlo.`,
    "metal.team": "Color del equipo",
    "metal.gold": "Oro",
    "metal.silver": "Plata",
    "metal.bronze": "Bronce",
    "metal.white": "Blanco",
    "filament.Black": "Negro",
    "filament.Blue": "Azul",
    "filament.Red": "Rojo",
    "filament.Purple": "Morado",
    "filament.Yellow": "Amarillo",
    "filament.Green": "Verde",
    "filament.Gold": "Oro",
    "filament.Silver": "Plata",
    "filament.Bronze": "Bronce",
    "filament.White": "Blanco",

    // actions
    "act.forge": "Forjar este token",
    "act.enqueue": "Añadir a imprimir",
    "act.save": "Guardar",
    "act.note": "Descarga los STL, boca abajo y listos para Bambu Studio.",
    "act.downloaded": ({ file }) => `Descargado ${file}.`,
    "act.downloadFailed": ({ message }) => `No se pudo preparar la descarga: ${message}`,
    "act.queued": ({ name, n }) => `Añadido «${name}»${n ? ` y ${plural(n, "1 recordatorio", `${n} recordatorios`)}` : ""} a la cola de impresión.`,
    "act.queuedMany": ({ n, extra }) => (n
      ? `${plural(n, "Añadido 1 personaje", `Añadidos ${n} personajes`)} a la cola${extra ? `, con ${extra} recordatorios` : ""}, con el estilo actual.`
      : `${plural(extra, "Añadido 1 recordatorio", `Añadidos ${extra} recordatorios`)} a la cola, con el estilo actual.`),

    // tray
    "tray.aria": "Personajes",
    "tray.characters": "Personajes",
    "tray.reminders": "Recordatorios",
    "tray.edition": "Edición",
    "tray.team": "Equipo",
    "tray.allEditions": "Todas las ediciones",
    "tray.noReminders": "Ningún recordatorio coincide.",
    "tray.countCharacters": ({ n }) => `${n} ${plural(n, "personaje", "personajes")}`,
    "tray.countReminders": ({ n }) => `${n} ${plural(n, "recordatorio", "recordatorios")}`,
    "tray.chooseSeveral": "Elegir varios",
    "tray.search": "Buscar",
    "tray.noMatch": "Ningún personaje coincide.",
    "pick.count": ({ n }) => `${n} ${plural(n, "elegido", "elegidos")}`,
    "pick.prompt": "Toca los personajes que quieras imprimir",
    "pick.all": "Elegir todos los visibles",
    "pick.none": "Quitar selección",
    "pick.add": ({ n }) => (n ? `Añadir ${n} a imprimir` : "Añadir a imprimir"),

    // queue
    "queue.import": "Importar un script",
    "queue.paste": "Pegar JSON",
    "queue.pasteImport": "Importar",
    "queue.pasteAria": "JSON del script",
    "queue.withReminders": "Incluir recordatorios al añadir personajes",
    "queue.importHelp": "Usa el JSON de la herramienta oficial de scripts (Script Tool). Cada personaje se añade con el estilo actual.",
    "queue.empty": "Añade tokens aquí y descárgalos todos juntos como un proyecto de Bambu Studio. Usa «Elegir varios» en la bandeja para añadir muchos a la vez.",
    "queue.remove": "Quitar",
    "queue.removeAria": ({ name }) => `Quitar ${name}`,
    "queue.download": "Descargar para Bambu A1",
    "queue.clear": "Vaciar la cola",
    "queue.clearConfirm": "¿Vaciar todo?",
    "queue.plan": ({ n, plates, filaments }) => `${n} ${plural(n, "placa", "placas")}: ${plates}. Filamentos: ${filaments}.`,
    "queue.building": ({ i, n, name }) => `Preparando ${i} de ${n}: ${name}`,
    "queue.writing": ({ i, n }) => `Escribiendo el proyecto: ${i} de ${n}`,
    "queue.done": ({ file, n, filaments }) => `Descargado ${file}: ${n} ${plural(n, "placa", "placas")}, filamentos ${filaments}. Ábrelo en Bambu Studio y asigna cada filamento a una ranura del AMS.`,
    "queue.failed": ({ message }) => `No se pudo crear el proyecto: ${message}`,
    "queue.reminderSuffix": " · recordatorios",
    "import.done": ({ n, extra, name }) => `${plural(n, "Añadido 1 personaje", `Añadidos ${n} personajes`)}${extra ? ` y ${extra} recordatorios` : ""}${name ? ` de «${name}»` : ""}.`,
    "import.skipped": ({ n, list }) => ` Se ${plural(n, "omitió 1 personaje que no está", `omitieron ${n} personajes que no están`)} en la biblioteca (¿homebrew?): ${list}.`,
    "import.failed": ({ message }) => `No se pudo importar el script: ${message}.`,
    "import.badJson": "no es un JSON válido. Exporta el script como JSON desde la herramienta de scripts y vuelve a intentarlo",
    "import.notList": "un script es una lista JSON de personajes que empieza por [",
    "import.noneKnown": "ninguno de los personajes del script está en la biblioteca",

    // saved designs
    "saved.empty": "Los tokens que guardes aparecen aquí, en cualquier dispositivo donde entres.",
    "saved.loadFailed": ({ message }) => `No se pudieron cargar tus tokens: ${message}`,
    "saved.delete": "Borrar",
    "saved.deleteConfirm": "¿Borrar?",
    "saved.deleteAria": ({ name }) => `Borrar ${name}`,
    "saved.saved": ({ name }) => `Guardado «${name}» en Mis tokens.`,
    "saved.failed": ({ message }) => `No se pudo guardar: ${message}`,
    "saved.opened": ({ name }) => `Abierto «${name}». Al guardar se actualiza.`,

    // footer
    "ccc.app": "Herramienta gratuita hecha por la comunidad. No está afiliada ni respaldada por The Pandemonium Institute. Ilustraciones de personajes © The Pandemonium Institute.",
    "ccc.gate": "Herramienta gratuita hecha por la comunidad para imprimir tus propios tokens de personaje. No está afiliada ni respaldada por The Pandemonium Institute.",

    // admin
    "admin.title": "Biblioteca e invitaciones",
    "admin.close": "Cerrar",
    "admin.library": "Biblioteca de personajes",
    "admin.uploadRoles": "Subir roles_data.json",
    "admin.uploadSeal": "Subir seal.svg",
    "admin.libraryState": ({ n }) => `${n} personajes en la biblioteca. Si vuelves a subirla, se sustituyen los que coincidan.`,
    "admin.libraryEmpty": "La biblioteca está vacía.",
    "admin.uploading": ({ i, n }) => `Subiendo ${i} de ${n}…`,
    "admin.uploaded": ({ n }) => `Subidos ${n} personajes. Recargando…`,
    "admin.sealUploaded": "Sello subido. Recargando…",
    "admin.notSvg": "ese archivo no es un SVG",
    "admin.uploadFailed": ({ message }) => `No se pudo subir: ${message}`,
    "admin.invited": "Personas invitadas",
    "admin.invite": "Invitar",
    "admin.inviteAria": "Email a invitar",
    "admin.inviteHint": "Entran con esta cuenta de Google.",
    "admin.invitedOne": ({ email }) => `Invitado ${email}. Envíale el enlace; entra con esa cuenta de Google.`,
    "admin.nobody": "Todavía no has invitado a nadie.",
    "admin.remove": "Quitar",
    "admin.removeConfirm": "¿Quitar?",
  },

  en: {
    "gate.signedOut.title": "Print the characters of your grimoire",
    "gate.signedOut.text": "Design coin tokens for your group in Spanish or English, turn them in 3D and download STLs for your printer. Midnight Mint is invite-only for now.",
    "gate.signIn": "Sign in with Google",
    "gate.signInFailed": ({ message }) => `Sign-in failed: ${message}`,
    "gate.opening": "Opening the grimoire…",
    "gate.notInvited.title": "You're not on the list yet",
    "gate.notInvited.text": ({ admin, email }) => `Midnight Mint is invite-only while we wait for The Pandemonium Institute's go-ahead. Ask ${admin} to invite ${email}, then sign in again.`,
    "gate.signOut": "Sign out",
    "gate.empty.title": "The library is empty",
    "gate.empty.text": "Upload roles_data.json (in admin-data/) to add the 181 characters.",
    "gate.empty.open": "Open library and invites",
    "gate.settingUp.title": "The library is being set up",
    "gate.settingUp.text": "No characters have been added yet. Try again a little later.",
    "gate.error.title": "Couldn't open the grimoire",
    "gate.error.text": ({ message }) => `${message}. Check your connection and reload the page.`,
    "gate.reload": "Reload",

    "view.aria": "The token in 3D. Drag to turn it.",
    "view.group": "View",
    "view.angle": "Angle",
    "view.front": "Front",
    "view.back": "Back",
    "lang.group": "Language",
    "me.aria": "Your account",
    "me.admin": "Library and invites",
    "me.signOut": "Sign out",

    "sec.saved": "My tokens",
    "sec.queue": "Print queue",
    "sec.name": "Name",
    "sec.reminders": "Reminders",
    "sec.frame": "Frame",
    "sec.back": "Back",
    "sec.coin": "Coin",

    "name.aria": "Name on the token",
    "name.hint": ({ arc, mm, shrunk, small }) => `${arc}° of the rim, letters ${mm} mm${shrunk ? " (shrunk to fit)" : ""}.${small ? " Small for a 0.4 mm nozzle." : ""}`,
    "range.textSize": "Letter height",
    "range.spacing": "Spacing",
    "range.maxArc": "Longest arc",
    "range.frameWidth": "Width",
    "range.diameter": "Diameter",
    "range.height": "Thickness",
    "range.depth": "Inlay depth",
    "range.iconScale": "Icon size",

    "reminders.none": "none",
    "reminders.noneHint": "This character has no reminder tokens.",
    "reminders.tapHint": "Tap one to preview it.",
    "reminders.previewHint": "Previewing the reminder. Tap it again to go back to the character.",
    "reminders.size": ({ mm }) => `${mm} mm coin.`,
    "reminders.small": ({ mm }) => ` The longest ends up with ${mm} mm letters, small to print.`,
    "reminders.add": "Add these reminders to print",
    "reminders.added": ({ n, name }) => `Added ${n} ${plural(n, "reminder", "reminders")} for “${name}” to the print queue.`,

    "frame.none": "None",
    "frame.rim": "Rim",
    "frame.double": "Double rim",
    "frame.clock": "Clock ticks",
    "frame.beads": "Beads",
    "back.none": "Plain",
    "back.edition": "Edition",
    "back.seal": "Clocktower seal",
    "back.clock": "Clock face",
    "back.rings": "Rings",
    "back.name": "Role name",
    "back.custom": "Your SVG",
    "frame.aria": "Frame filament",
    "back.aria": "Back filament",
    "upload.aria": "Your SVG pattern",
    "upload.tooBig": ({ file, kb, max }) => `${file} is ${kb} KB. Use an SVG under ${max} KB.`,
    "upload.using": ({ file }) => `Using ${file}. Pick “Your SVG” again to replace it.`,
    "metal.team": "Team colour",
    "metal.gold": "Gold",
    "metal.silver": "Silver",
    "metal.bronze": "Bronze",
    "metal.white": "White",
    "filament.Black": "Black",
    "filament.Blue": "Blue",
    "filament.Red": "Red",
    "filament.Purple": "Purple",
    "filament.Yellow": "Yellow",
    "filament.Green": "Green",
    "filament.Gold": "Gold",
    "filament.Silver": "Silver",
    "filament.Bronze": "Bronze",
    "filament.White": "White",

    "act.forge": "Forge this token",
    "act.enqueue": "Add to print",
    "act.save": "Save",
    "act.note": "Downloads the STLs, face-down and ready for Bambu Studio.",
    "act.downloaded": ({ file }) => `Downloaded ${file}.`,
    "act.downloadFailed": ({ message }) => `Couldn't build the download: ${message}`,
    "act.queued": ({ name, n }) => `Added “${name}”${n ? ` and ${n} ${plural(n, "reminder", "reminders")}` : ""} to the print queue.`,
    "act.queuedMany": ({ n, extra }) => (n
      ? `Added ${n} ${plural(n, "character", "characters")} to the print queue${extra ? ` with ${extra} reminders` : ""}, in the current style.`
      : `Added ${extra} ${plural(extra, "reminder", "reminders")} to the print queue, in the current style.`),

    "tray.aria": "Characters",
    "tray.characters": "Characters",
    "tray.reminders": "Reminders",
    "tray.edition": "Edition",
    "tray.team": "Team",
    "tray.allEditions": "All editions",
    "tray.noReminders": "No reminder matches.",
    "tray.countCharacters": ({ n }) => `${n} ${plural(n, "character", "characters")}`,
    "tray.countReminders": ({ n }) => `${n} ${plural(n, "reminder", "reminders")}`,
    "tray.chooseSeveral": "Choose several",
    "tray.search": "Search",
    "tray.noMatch": "No character matches.",
    "pick.count": ({ n }) => `${n} chosen`,
    "pick.prompt": "Tap the characters you want to print",
    "pick.all": "Select all shown",
    "pick.none": "Clear selection",
    "pick.add": ({ n }) => (n ? `Add ${n} to print` : "Add to print"),

    "queue.import": "Import a script",
    "queue.paste": "Paste JSON",
    "queue.pasteImport": "Import",
    "queue.pasteAria": "Script JSON",
    "queue.withReminders": "Include reminder tokens when adding characters",
    "queue.importHelp": "Use the JSON from the official Script Tool. Every character is added with the current style.",
    "queue.empty": "Add tokens here, then download them all as one Bambu Studio project. Use “Choose several” in the tray to add many at once.",
    "queue.remove": "Remove",
    "queue.removeAria": ({ name }) => `Remove ${name}`,
    "queue.download": "Download for Bambu A1",
    "queue.clear": "Clear the queue",
    "queue.clearConfirm": "Clear all?",
    "queue.plan": ({ n, plates, filaments }) => `${n} ${plural(n, "plate", "plates")}: ${plates}. Filaments: ${filaments}.`,
    "queue.building": ({ i, n, name }) => `Building ${i} of ${n}: ${name}`,
    "queue.writing": ({ i, n }) => `Writing the project: ${i} of ${n}`,
    "queue.done": ({ file, n, filaments }) => `Downloaded ${file}: ${n} ${plural(n, "plate", "plates")}, filaments ${filaments}. Open it in Bambu Studio and match each filament to an AMS slot.`,
    "queue.failed": ({ message }) => `Couldn't build the project: ${message}`,
    "queue.reminderSuffix": " reminders",
    "import.done": ({ n, extra, name }) => `Added ${n} ${plural(n, "character", "characters")}${extra ? ` and ${extra} reminders` : ""}${name ? ` from “${name}”` : ""}.`,
    "import.skipped": ({ n, list }) => ` Skipped ${n} not in the library (homebrew?): ${list}.`,
    "import.failed": ({ message }) => `Couldn't import the script: ${message}.`,
    "import.badJson": "that isn't valid JSON. Export the script from the Script Tool as JSON and try again",
    "import.notList": "a script is a JSON list of characters, starting with [",
    "import.noneKnown": "none of the characters in that script are in the library",

    "saved.empty": "Tokens you save appear here, on any device you sign in on.",
    "saved.loadFailed": ({ message }) => `Couldn't load your tokens: ${message}`,
    "saved.delete": "Delete",
    "saved.deleteConfirm": "Delete?",
    "saved.deleteAria": ({ name }) => `Delete ${name}`,
    "saved.saved": ({ name }) => `Saved “${name}” to My tokens.`,
    "saved.failed": ({ message }) => `Couldn't save: ${message}`,
    "saved.opened": ({ name }) => `Opened “${name}”. Saving updates it.`,

    "ccc.app": "A free, community-made tool. Not affiliated with or endorsed by The Pandemonium Institute. Character art © The Pandemonium Institute.",
    "ccc.gate": "A free, community-made tool for printing your own character tokens. Not affiliated with or endorsed by The Pandemonium Institute.",

    "admin.title": "Library and invites",
    "admin.close": "Close",
    "admin.library": "Character library",
    "admin.uploadRoles": "Upload roles_data.json",
    "admin.uploadSeal": "Upload seal.svg",
    "admin.libraryState": ({ n }) => `${n} characters in the library. Uploading again replaces matching characters.`,
    "admin.libraryEmpty": "The library is empty.",
    "admin.uploading": ({ i, n }) => `Uploading ${i} of ${n}…`,
    "admin.uploaded": ({ n }) => `Uploaded ${n} characters. Reloading…`,
    "admin.sealUploaded": "Uploaded the seal. Reloading…",
    "admin.notSvg": "that file isn't an SVG",
    "admin.uploadFailed": ({ message }) => `Upload failed: ${message}`,
    "admin.invited": "Invited people",
    "admin.invite": "Invite",
    "admin.inviteAria": "Email to invite",
    "admin.inviteHint": "They sign in with this Google account.",
    "admin.invitedOne": ({ email }) => `Invited ${email}. Send them the link; they sign in with that Google account.`,
    "admin.nobody": "Nobody invited yet.",
    "admin.remove": "Remove",
    "admin.removeConfirm": "Remove?",
  },
};

const STORE_KEY = "midnight-mint-lang";
const initial = (() => {
  try { const saved = localStorage.getItem(STORE_KEY); if (saved === "es" || saved === "en") return saved; } catch { /* no storage */ }
  return "es";   // made for a Spanish group; the switch remembers other choices
})();
let lang = initial;

export const uiLang = () => lang;

/** Translated text for `key`; functions receive `vars`. Falls back to English, then the key. */
export function t(key, vars = {}) {
  const v = STR[lang][key] ?? STR.en[key];
  if (v === undefined) return key;
  return typeof v === "function" ? v(vars) : v;
}

/** Applies the language to every element marked with data-i18n / data-i18n-attr. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(/\s+/)) {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function setUiLang(next) {
  lang = next === "en" ? "en" : "es";
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* no storage */ }
  document.documentElement.lang = lang;
  applyStatic();
}
