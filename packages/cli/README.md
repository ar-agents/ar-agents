# `@ar-agents/cli`

> Cliente de linea de comandos para el studio de ar-agents.

Tres comandos: iniciar sesion (con una cuenta anonima nueva o un token
existente), ver quien sos (uso, tope mensual y estado de tu sociedad, si
constituiste una), y charlar con el coach de ar-agents.

## Instalacion

```sh
npx @ar-agents/cli login
```

O instalado globalmente:

```sh
npm install -g @ar-agents/cli
ar-agents login
```

## Uso

```sh
# Crea una cuenta anonima nueva y guarda las credenciales localmente
ar-agents login

# O inicia sesion con un token que ya tenes
ar-agents login --token stu_...

# Apunta a otro studio (default: https://studio-plum-three-47.vercel.app)
ar-agents login --url https://mi-studio.vercel.app

# Muestra la cuenta activa
ar-agents whoami

# Charla con el coach de ar-agents (requiere sesion iniciada)
ar-agents chat
```

`STUDIO_URL` (variable de entorno) tambien sirve para fijar el studio por
default, sin pasar `--url` cada vez.

## Donde se guarda la sesion

La config vive en el directorio estandar del sistema operativo:

- macOS: `~/Library/Application Support/ar-agents/config.json`
- Windows: `%APPDATA%\ar-agents\config.json`
- Linux/otros: `$XDG_CONFIG_HOME/ar-agents/config.json` (o `~/.config/ar-agents/config.json`)

El archivo se escribe con permisos `0600` (solo vos podes leerlo) porque
contiene el token de la cuenta. El CLI nunca imprime el token por pantalla.

Para overridear el directorio (util en testing o en entornos sin el layout
estandar), fija `AR_AGENTS_CONFIG_DIR`.
