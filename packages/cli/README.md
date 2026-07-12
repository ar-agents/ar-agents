# `@ar-agents/cli`

> Cliente de linea de comandos para el studio de ar-agents.

Iniciar sesion (con una cuenta anonima nueva o un token existente), ver
quien sos (uso, tope mensual y estado de tu sociedad, si constituiste una),
charlar con el coach de ar-agents, y operar tu sociedad ya constituida desde
la terminal: ver su resumen, el tablero de actividad en vivo (deploy,
clientes, kill switch, aprobaciones pendientes, acciones recientes), y
suspenderla o reanudarla.

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

# Muestra el resumen de tu sociedad ya constituida
ar-agents society

# Muestra el tablero en vivo: deploy, clientes, kill switch,
# aprobaciones pendientes y acciones recientes
ar-agents activity

# Suspende la sociedad (kill switch). Requiere --confirmar de forma explicita,
# no llama a la red sin esa confirmacion. --motivo es opcional.
ar-agents suspend --motivo "mantenimiento programado" --confirmar

# Reanuda una sociedad suspendida. Tambien requiere --confirmar.
ar-agents resume --confirmar
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
