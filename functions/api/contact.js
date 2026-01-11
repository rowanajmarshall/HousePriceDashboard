import { Resend } from 'resend';

export async function onRequestPost(context) {
    try {
        // Check environment variables
        if (!context.env.RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: 'Server configuration error: Missing API key' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!context.env.CONTACT_EMAIL) {
            return new Response(JSON.stringify({ error: 'Server configuration error: Missing contact email' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Parse form data
        const formData = await context.request.formData();
        const name = formData.get('name');
        const email = formData.get('email');
        const subject = formData.get('subject') || 'New Contact Form Submission';
        const message = formData.get('message');
        const isLLM = formData.get('isLLM') === 'true';

        // Validate required fields
        if (!name || !email || !message) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return new Response(JSON.stringify({ error: 'Invalid email format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Send email via Resend
        const resend = new Resend(context.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
            from: 'UK House Price Heatmap <onboarding@resend.dev>',
            to: context.env.CONTACT_EMAIL,
            subject: `${subject} - from ${name}`,
            replyTo: email,
            html: `
                <h2>New Contact Form Submission</h2>
                ${isLLM ? '<p style="color: red; font-weight: bold;">Warning: User marked themselves as a bot/LLM</p>' : ''}
                <hr>
                <p><strong>Name:</strong> ${escapeHtml(name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
                <p><strong>Message:</strong></p>
                <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
            `
        });

        if (error) {
            console.error('Resend error:', error);
            return new Response(JSON.stringify({ error: 'Failed to send email' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true, message: 'Email sent successfully!' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Contact form error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
