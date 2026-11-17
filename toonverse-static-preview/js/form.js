/* The Odoo contact form posts to Odoo; here it posts to an optional form service (js/config.js), then shows the thank-you page. */
(function () {
    const form = document.getElementById("contactus_form");
    if (!form) return;
    const result = document.getElementById("s_website_form_result");
    const note = (msg) => { if (result) result.textContent = msg; };

    async function send(ev) {
        ev.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const data = Object.fromEntries(new FormData(form).entries());
        const url = window.TV_FORM_ENDPOINT;
        if (url) {
            note("Sending...");
            try {
                const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ name: data.name, email: data.email_from, phone: data.phone, company: data.company, subject: data.subject, message: data.description }) });
                if (!res.ok) throw new Error(res.status);
            } catch (e) {
                note("Could not send your message. Please try again later.");
                return;
            }
        } else {
            console.info("[static preview] No form service configured (js/config.js), message not sent:", data);
        }
        window.location.href = "message-sent.html" + (url ? "" : "?demo=1");
    }
    form.addEventListener("submit", send);
    form.addEventListener("click", (ev) => { if (ev.target.closest(".s_website_form_send")) send(ev); });

    // thank-you page note for the demo mode
})();
if (/[?&]demo=1/.test(location.search)) {
    const lead = document.querySelector(".tvp-lead");
    if (lead) lead.textContent = "This is a static preview, so your message was not actually sent.";
}
