// The admin's dialog: uploading the role library.
import { $, state, input } from "./context.ts";
import { loadRoles, uploadRoles } from "../services.ts";
import { t } from "../i18n.ts";

// ------------------------------------------------------------ admin

export async function openAdmin() {
  const dlg = $<HTMLDialogElement>("#admin");
  if (!dlg.open) dlg.showModal();
  const roles = state.lib?.roles.length ?? (await loadRoles()).length;
  $("#libraryState").textContent = roles ? t("admin.libraryState", { n: roles }) : t("admin.libraryEmpty");
}
$("#libraryFile").onchange = async (e) => {
  const f = input(e).files![0]; input(e).value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const roles = JSON.parse(await f.text());
    const count = await uploadRoles(roles, (done, total) => { out.textContent = t("admin.uploading", { i: done, n: total }); });
    out.textContent = t("admin.uploaded", { n: count });
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = t("admin.uploadFailed", { message: (err as Error).message }); }
};
