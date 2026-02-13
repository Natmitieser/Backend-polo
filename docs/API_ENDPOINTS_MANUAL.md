# 📘 Polo Core API — Manual de Endpoints

> **Base URL (Local):** `http://localhost:3001`  
> **Base URL (Producción):** Tu URL de Vercel  
> **Postman Collection:** `polo-core-api/polo-core-api.postman_collection.json`

---

## 🔐 Sistema de Autenticación

Polo tiene **dos flujos de autenticación** independientes:

| Flujo | Para quién | Header | Cómo se obtiene |
|-------|-----------|--------|-----------------|
| **Console Auth** | Desarrolladores (empresas) | `Authorization: Bearer <JWT>` | Login con email + OTP → JWT |
| **SDK Auth** | Usuarios finales | `x-publishable-key: pk_...` | La empresa le da la key al integrar el SDK |

```
┌─────────────────────────────────────────────────────┐
│                  FLUJO COMPLETO                     │
│                                                     │
│  Desarrollador                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Challenge │───▶│  Verify  │───▶│  JWT ✅  │      │
│  │ (email)   │    │ (código) │    │          │      │
│  └──────────┘    └──────────┘    └────┬─────┘      │
│                                       │             │
│                              Crear App (POST /apps) │
│                                       │             │
│                                       ▼             │
│                              publishable_key (pk_)  │
│                                       │             │
│  Usuario Final                        │             │
│  ┌──────────┐    ┌──────────┐    ┌───▼──────┐      │
│  │ Challenge │───▶│  Verify  │───▶│ Wallet ✅│      │
│  │ (email)   │    │ (código) │    │ Balance  │      │
│  └──────────┘    └──────────┘    │ Payments │      │
│                                  └──────────┘      │
└─────────────────────────────────────────────────────┘
```

---

## 0. Sistema

### `GET /api/v1/health`

Verifica que la API esté activa. **No requiere autenticación.**

**Request:**
```
GET {{base_url}}/api/v1/health
```

**Response 200:**
```json
{
    "status": "ok",
    "service": "polo-core-api",
    "version": "1.0.0",
    "network": "testnet",
    "timestamp": "2026-02-12T22:00:00.000Z"
}
```

---

## 1. Console Auth (Desarrollador)

### `POST /api/v1/console/auth/challenge`

Envía un código OTP de **8 dígitos** al email del desarrollador vía Resend.  
**No requiere autenticación** (endpoint público).

**Request:**
```
POST {{base_url}}/api/v1/console/auth/challenge
Content-Type: application/json

{
    "email": "developer@gmail.com"
}
```

**Response 200:**
```json
{
    "status": "success",
    "message": "Verification code sent to email"
}
```

**Errores posibles:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `Valid email is required` | Email vacío o sin @ |
| 500 | `Email service not configured` | Falta RESEND_API_KEY |

---

### `POST /api/v1/console/auth/verify`

Verifica el código OTP del desarrollador. Si es válido:
1. Crea el perfil del developer en la tabla `developers`
2. Crea/obtiene el usuario en Supabase Auth
3. Retorna un **JWT token** válido para usar en los demás endpoints

**Request:**
```
POST {{base_url}}/api/v1/console/auth/verify
Content-Type: application/json

{
    "email": "developer@gmail.com",
    "code": "12345678"
}
```

**Response 200:**
```json
{
    "status": "success",
    "message": "Authenticated successfully",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "v1.MRjg...",
    "expires_at": 1707782400,
    "user": {
        "id": "uuid-del-developer",
        "supabase_id": "uuid-de-supabase",
        "email": "developer@gmail.com"
    }
}
```

> ⚠️ **Guarda el `token`** — lo necesitas como `Authorization: Bearer <token>` para todos los endpoints que requieren JWT.

**Errores posibles:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `Email and code are required` | Faltan campos |
| 401 | `Invalid or expired code` | Código incorrecto o expirado (10 min) |
| 500 | `Failed to create session` | Error interno de Supabase |

---

### `GET /api/v1/console/auth/me`

Retorna la información del desarrollador autenticado.

**Request:**
```
GET {{base_url}}/api/v1/console/auth/me
Authorization: Bearer {{jwt_token}}
```

**Response 200:**
```json
{
    "status": "success",
    "user": {
        "id": "uuid-de-supabase",
        "email": "developer@gmail.com"
    }
}
```

---

## 2. Apps (Proyectos)

Las apps son los **proyectos** que crea el desarrollador. Cada app genera una `publishable_key` (empezando con `pk_`) que se usa para autenticar el SDK de usuarios finales.

### `POST /api/v1/apps`

Crea un nuevo proyecto/app.

**Request:**
```
POST {{base_url}}/api/v1/apps
Content-Type: application/json
Authorization: Bearer {{jwt_token}}

{
    "name": "Mi App Fintech"
}
```

**Response 201:**
```json
{
    "status": "created",
    "app": {
        "id": "uuid-de-la-app",
        "owner_id": "uuid-del-developer",
        "name": "Mi App Fintech",
        "api_key": "sk_...",
        "publishable_key": "pk_67f3a45b34bee6a0ec1e3c506d317de4",
        "allowed_domains": [],
        "created_at": "2026-02-12T22:00:00.000Z"
    }
}
```

> ⚠️ **Guarda la `publishable_key`** — es lo que los usuarios finales usan para autenticarse con el SDK.

---

### `GET /api/v1/apps`

Lista todos los proyectos del desarrollador.

**Request:**
```
GET {{base_url}}/api/v1/apps
Authorization: Bearer {{jwt_token}}
```

**Response 200:**
```json
{
    "status": "success",
    "apps": [
        {
            "id": "uuid",
            "name": "Mi App Fintech",
            "publishable_key": "pk_...",
            "created_at": "2026-02-12T22:00:00.000Z"
        }
    ]
}
```

---

## 3. SDK Auth (Usuarios Finales)

Este es el flujo para los **usuarios finales** de las apps creadas por desarrolladores. Usa `x-publishable-key` en lugar de JWT.

### `POST /api/v1/auth/challenge`

Envía un código OTP de **8 dígitos** al email del usuario final.

**Request:**
```
POST {{base_url}}/api/v1/auth/challenge
Content-Type: application/json
x-publishable-key: pk_67f3a45b34bee6a0ec1e3c506d317de4

{
    "email": "usuario@gmail.com"
}
```

**Response 200:**
```json
{
    "status": "success",
    "message": "Code sent to email"
}
```

**Errores posibles:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `Valid email is required` | Email inválido |
| 401 | `Invalid API Key. Project not found.` | publishable_key incorrecta |

---

### `POST /api/v1/auth/verify`

Verifica el OTP del usuario y retorna/crea su **wallet Stellar**.

**Request:**
```
POST {{base_url}}/api/v1/auth/verify
Content-Type: application/json
x-publishable-key: pk_67f3a45b34bee6a0ec1e3c506d317de4

{
    "email": "usuario@gmail.com",
    "code": "12345678"
}
```

**Response 200:**
```json
{
    "status": "success",
    "message": "Authenticated successfully",
    "token": "session_token_placeholder",
    "wallet": {
        "address": "GBXYZ...56CHARS...ABC",
        "status": "active",
        "balance": "2.0 XLM (0.0 USDC)"
    }
}
```

> ✅ La wallet se crea automáticamente en la primera verificación exitosa.

---

## 4. Wallet

### `GET /api/v1/wallet/balance`

Obtiene los saldos **en tiempo real** de la wallet del usuario desde Stellar Horizon.

**Request:**
```
GET {{base_url}}/api/v1/wallet/balance
x-publishable-key: pk_67f3a45b34bee6a0ec1e3c506d317de4
```

**Response 200:**
```json
{
    "status": "success",
    "wallet": "GBXYZ...56CHARS...ABC",
    "balances": {
        "XLM": "98.5000000",
        "USDC": "50.0000000"
    }
}
```

---

### `POST /api/v1/wallet/create` *(Legacy)*

Crea una wallet manualmente. **No es necesario** si usas el flujo `auth/verify` que ya crea wallets automáticamente.

**Request:**
```
POST {{base_url}}/api/v1/wallet/create
Content-Type: application/json
x-publishable-key: pk_...

{}
```

**Response 201:**
```json
{
    "status": "created",
    "wallet": "GBXYZ...56CHARS...ABC",
    "balance": "2.0 XLM (0.0 USDC)",
    "tx_hash": "abc123..."
}
```

---

## 5. Payments

### `POST /api/v1/payment/send`

Envía un pago desde la wallet custodiada del usuario a otra dirección Stellar.

**Request:**
```
POST {{base_url}}/api/v1/payment/send
Content-Type: application/json
x-publishable-key: pk_67f3a45b34bee6a0ec1e3c506d317de4

{
    "destination": "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "amount": "10.5",
    "assetCode": "XLM"
}
```

**Campos del body:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `destination` | string | ✅ | Dirección Stellar (56 chars, empieza con G) |
| `amount` | string | ✅ | Cantidad a enviar (positivo) |
| `assetCode` | string | ❌ | `"XLM"` (default) o `"USDC"` |

**Response 200:**
```json
{
    "status": "success",
    "tx_hash": "abc123def456...",
    "amount": "10.5",
    "asset": "XLM"
}
```

**Errores posibles:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `Missing required fields` | Falta destination o amount |
| 400 | `Invalid Stellar address` | Dirección no empieza con G o no tiene 56 chars |
| 404 | `Wallet not found` | Usuario no tiene wallet creada |
| 500 | `Payment failed` | Fondos insuficientes o error de red Stellar |

---

## 6. History

### `GET /api/v1/history`

Obtiene el historial de transacciones desde Stellar Horizon.

**Request:**
```
GET {{base_url}}/api/v1/history?limit=10
x-publishable-key: pk_67f3a45b34bee6a0ec1e3c506d317de4
```

**Parámetros query:**
| Param | Tipo | Default | Max | Descripción |
|-------|------|---------|-----|-------------|
| `limit` | number | 10 | 50 | Cantidad de transacciones |

**Response 200:**
```json
{
    "status": "success",
    "wallet": "GBXYZ...56CHARS...ABC",
    "history": [
        {
            "type": "payment",
            "amount": "10.5",
            "asset_type": "native",
            "from": "GABC...",
            "to": "GXYZ...",
            "created_at": "2026-02-12T22:00:00Z"
        }
    ]
}
```

---

## 📋 Guía Rápida de Postman

### Importar la colección
1. Abre Postman → **Import** → selecciona `polo-core-api.postman_collection.json`
2. La colección aparecerá como **"Polo Core API — Complete Collection"**

### Configurar variables
Edita estas variables en la colección (click derecho → Edit → Variables):

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `base_url` | `http://localhost:3001` | URL del backend |
| `developer_email` | `tu-email@gmail.com` | Tu email para login de consola |
| `user_email` | `usuario@gmail.com` | Email del usuario final |

### Flujo paso a paso

| # | Request | Qué hacer |
|---|---------|-----------|
| 1 | Health Check | Solo enviar, verificar que responde 200 |
| 2 | Console Challenge | Enviar → revisar email por código de 8 dígitos |
| 3 | Console Verify | Poner código en variable `otp_code` → enviar → **JWT se guarda solo** |
| 4 | Create App | Enviar → **publishable_key se guarda sola** |
| 5 | SDK Challenge | Enviar → revisar email del usuario |
| 6 | SDK Verify | Poner código en `otp_code` → enviar → wallet creada |
| 7 | Get Balance | Enviar → ver saldos XLM/USDC |

> 💡 Los scripts de test guardan `jwt_token` y `publishable_key` automáticamente en las variables de la colección.

---

## 🗄️ Tablas en Supabase

El sistema usa estas tablas:

| Tabla | Propósito |
|-------|-----------|
| `developers` | Perfiles de desarrolladores |
| `developer_otp_codes` | Códigos OTP para login de consola |
| `apps` | Proyectos/apps creadas por developers |
| `sdk_users` | Usuarios finales de cada app |
| `otp_codes` | Códigos OTP para login de usuarios SDK |
| `custody_wallets` | Wallets Stellar encriptadas |
