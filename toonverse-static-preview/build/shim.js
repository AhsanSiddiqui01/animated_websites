/* Runs the Odoo module's own scripts without Odoo: a tiny stand-in for Odoo's publicWidget. */
(function () {
    window.TVShim = { publicWidget: { registry: {}, Widget: { extend(o) { return o; } } } };
    window.TRShim = window.TVShim; // boot.js reads the registry from here
})();
