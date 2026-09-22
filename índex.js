const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');

const OWNER_NUMBER = '258858848772';

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ['Paulo-Bot', 'Chrome', '1.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Paulo-bot conectado!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const sender = from.split('@')[0];
        const isOwner = sender === OWNER_NUMBER || msg.key.participant?.includes(OWNER_NUMBER);

        console.log(`Mensagem de ${sender}: ${text}`);

        if (text.toLowerCase() === 'ping') {
            await sock.sendMessage(from, { text: '🏓 Pong! Paulo-bot online!' });
        }
        if (text.toLowerCase() === 'menu' || text.toLowerCase() === '.menu') {
            await sock.sendMessage(from, { text: `🤖 *PAULO-BOT MENU*\n\n*ping* - testar bot\n*menu* - este menu\n*dono* - falar com dono\n\nCriado para ${OWNER_NUMBER}` });
        }
        if (text.toLowerCase() === 'dono') {
            await sock.sendMessage(from, { text: `Meu dono é wa.me/${OWNER_NUMBER}` });
        }
    });
}

startBot();
