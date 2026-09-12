/* ============================================================
 * Icons - tiny helper for referencing the inline SVG sprite
 * (defined at the top of index.html) from JS-generated markup.
 * No emoji anywhere in this app; every glyph is one of the
 * <symbol> ids in that sprite.
 * ============================================================ */
function ic(name, cls) {
  return `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}
