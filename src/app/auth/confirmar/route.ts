import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Canjea el enlace del correo de confirmación por una sesión y lleva a la
 * ruta de destino (/bienvenido, /inicio, /nueva-clave, etc.).
 *
 * Soporta de manera transparente los tres formatos posibles de enlace:
 *  1. `token_hash` + `type`: Enviado en plantillas personalizadas (query params).
 *  2. `code`: Flujo PKCE nativo de Supabase (query param).
 *  3. `access_token` + `refresh_token` en el fragmento hash (`#access_token=...`):
 *     Generado cuando se usa {{ .ConfirmationURL }}, donde Supabase Auth
 *     hace la verificación interna y redirige por fragmento hash.
 *     Dado que los fragmentos hash NO viajan por HTTP al servidor, esta ruta
 *     responde con un script cliente que captura el hash, sincroniza la sesión
 *     con el servidor vía POST /auth/confirmar y redirige al destino.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error") || searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/";

  // Solo rutas internas: evita redirecciones abiertas no deseadas.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  // Si Supabase reporta un error explícito en la URL
  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
  }

  const supabase = await createClient();

  // Caso 1: token_hash + type (plantilla optimizada)
  if (token_hash && type) {
    let { error } = await supabase.auth.verifyOtp({ type, token_hash });
    // Respaldo de compatibilidad: en ciertos flujos 'signup' se canjea como 'email'
    if (error && (type === "signup" || type === "email")) {
      const altType: EmailOtpType = type === "signup" ? "email" : "signup";
      const retry = await supabase.auth.verifyOtp({ type: altType, token_hash });
      if (!retry.error) {
        error = null;
      }
    }

    if (error) {
      console.warn("Fallo al verificar token_hash en /auth/confirmar:", error.message);
      return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
    }

    return NextResponse.redirect(`${origin}${destino}`);
  }

  // Caso 2: code (flujo PKCE)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("Fallo al canjear code en /auth/confirmar:", error.message);
      return NextResponse.redirect(`${origin}/login?error=enlace_expirado`);
    }
    return NextResponse.redirect(`${origin}${destino}`);
  }

  // Caso 3: Sin parámetros de búsqueda en el servidor.
  // Es muy común cuando Supabase redirige con fragmentos de hash (#access_token=... o #error=...).
  // El navegador ejecuta este HTML/JS para extraer el hash y sincronizar la sesión.
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirmando cuenta | YAM</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 36px 28px;
      text-align: center;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3.5px solid rgba(255, 129, 44, 0.2);
      border-top-color: #ff812c;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 10px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    p { margin: 0; color: #94a3b8; font-size: 14.5px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Confirmando tu cuenta</h2>
    <p id="estado">Validando enlace de seguridad...</p>
  </div>
  <script>
    (async function() {
      try {
        const hash = window.location.hash ? window.location.hash.substring(1) : "";
        const search = window.location.search ? window.location.search.substring(1) : "";
        const hashParams = new URLSearchParams(hash);
        const searchParams = new URLSearchParams(search);

        // Si el enlace trajo error en el hash
        const error = hashParams.get("error") || searchParams.get("error");
        if (error) {
          window.location.replace("/login?error=enlace_expirado");
          return;
        }

        // Si el enlace trajo tokens de acceso en el hash
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          document.getElementById("estado").textContent = "Iniciando tu sesión de forma segura...";
          
          const res = await fetch("/auth/confirmar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken
            })
          });

          if (res.ok) {
            const next = searchParams.get("next") || "/";
            const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";
            window.location.replace(destino);
            return;
          }
        }

        // Si no hay tokens válidos
        window.location.replace("/login?error=enlace_invalido");
      } catch (err) {
        window.location.replace("/login?error=enlace_expirado");
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

/**
 * Establece la sesión en cookies seguras del servidor a partir de los tokens
 * recibidos en el cliente (para enlaces que canjean mediante fragmento hash).
 */
export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token } = await request.json();

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: "Tokens de sesión requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al procesar la sesión" },
      { status: 500 }
    );
  }
}
