const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const BOT_NAME = "👑 PAULO BOT ⚡";

// WEBHOOK DO MACRODROID
const MACRODROID_WEBHOOK =
    "https://trigger.macrodroid.com/9ba9acd6-6657-4fd4-81a3-db9363aaa647/transferir_megas";

// COLOQUE AQUI O SEU NÚMERO DO WHATSAPP
// Exemplo: 258841234567
const OWNER_NUMBERS = [
    "258841234567"
];

// ======================================================
// PASTAS E BANCO
// ======================================================

const DB = "./database";

if (!fs.existsSync(DB)) {
    fs.mkdirSync(DB, { recursive: true });
}

const FILES = {
    compras: path.join(DB, "compras.json"),
    config: path.join(DB, "config.json"),
    fila: path.join(DB, "fila.json"),
    nanos: path.join(DB, "nanos.json"),
    protecoes: path.join(DB, "protecoes.json")
};

function load(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }

        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
        console.log("Erro lendo banco:", file, e.message);
        return fallback;
    }
}

function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let compras = load(FILES.compras, []);
let config = load(FILES.config, {});
let fila = load(FILES.fila, []);
let nanos = load(FILES.nanos, {});
let protecoes = load(FILES.protecoes, {});

// ======================================================
// TABELA
// ======================================================

const TABELA = `
╭━━━〔 📶 TABELA PAULO BOT 〕━━━╮

☀️ DIÁRIO
410MB = 10 MTS
520MB = 13 MT
610MB = 15 MT
810MB = 20 MTS
1.30GB = 25MT
1.220GB = 30MT
1.540GB = 38MT
2.60MB = 50MTS
2.440GB = 60MT
3.100GB = 75MT
4.150GB = 100MT
5.200GB = 150 MTS
10GB = 230MT

📅 SEMANAL
3.4GB = 95 MTS
5.2GB = 145
7.1GB = 185 MTS
10.7GB = 285 MTS
14.300 = 379MTS

🗓️ MENSAL
2.920GB = 100MTS
7.GB = 190MTS
10.715GB = 290MTS
17.900GB = 489MTS
17.900GB = 470MTS
35.800GB = 989MTS
53.600GB = 1399MTS
71.500=GB1849MTS
89.400GB = 2350MTS

╰━━━━━━━━━━━━━━━━━━━━━━╯
`;

const PAGAMENTO = `
╭━━〔 💳 PAGAMENTO 〕━━╮

📱 Mpesa
Paulo Bernardo
858848772

📱 eMola
Ilda Francisco
873063572

Envie o comprovativo + NR que receberá os megas.

╰━━━━━━━━━━━━━━━━━━━━━━╯
`;

// ======================================================
// FUNÇÕES
// ======================================================

function jidNumber(jid) {
    return (jid || "").split("@")[0].split(":")[0];
}

function isOwner(jid) {
    return OWNER_NUMBERS.includes(jidNumber(jid));
}

function isGroup(jid) {
    return jid.endsWith("@g.us");
}

function gerarID() {
    return "MK" + Math.floor(10000000 + Math.random() * 90000000);
}

function texto(msg) {
    return (
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        ""
    ).trim();
}

function getQuoted(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
}

async function isAdmin(sock, jid, user) {
    try {
        const metadata = await sock.groupMetadata(jid);

        const membro = metadata.participants.find(
            p => p.id === user
        );

        return !!membro && (
            membro.admin === "admin" ||
            membro.admin === "superadmin"
        );
    } catch {
        return false;
    }
}

async function botIsAdmin(sock, jid) {
    const bot = jidNumber(sock.user.id);

    return await isAdmin(
        sock,
        jid,
        bot + "@s.whatsapp.net"
    );
}

async function somenteAdmin(sock, jid, remetente) {
    if (!isGroup(jid)) return true;

    if (isOwner(remetente)) return true;

    return await isAdmin(sock, jid, remetente);
}

function extrairNumero(texto) {
    const numero = texto.replace(/\D/g, "");

    if (numero.length < 9) return null;

    if (numero.startsWith("258")) {
        return numero;
    }

    return "258" + numero;
}

// ======================================================
// MACRODROID
// ======================================================

async function enviarMacroDroid(dados) {
    const url = new URL(MACRODROID_WEBHOOK);

    url.searchParams.set("id", dados.id);
    url.searchParams.set("pacote", dados.pacote);
    url.searchParams.set("megas", dados.megas);
    url.searchParams.set("numero", dados.numero);

    console.log("Enviando para MacroDroid:");
    console.log(url.toString().replace(
        MACRODROID_WEBHOOK,
        "WEBHOOK"
    ));

    const resposta = await fetch(url.toString(), {
        method: "GET"
    });

    return resposta.ok;
}

// ======================================================
// CONEXÃO
// ======================================================

async function iniciar() {

    const { state, saveCreds } =
        await useMultiFileAuthState("./sessions");

    const { version } =
        await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: "silent" }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
                state.keys,
                P({ level: "silent" })
            )
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {

        if (qr) {
            console.clear();
            console.log("📱 ESCANEIE O QR CODE:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("");
            console.log("=================================");
            console.log("👑 PAULO BOT ONLINE");
            console.log("🤖 MacroDroid conectado");
            console.log("=================================");
        }

        if (connection === "close") {

            const code =
                lastDisconnect?.error?.output?.statusCode;

            if (code !== DisconnectReason.loggedOut) {
                console.log("Reconectando...");
                setTimeout(iniciar, 3000);
            } else {
                console.log("Sessão encerrada.");
            }
        }
    });

    // ==================================================
    // MENSAGENS
    // ==================================================

    sock.ev.on("messages.upsert", async ({ messages }) => {

        try {

            const msg = messages[0];

            if (!msg?.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const remetente = msg.key.participant || jid;
            const body = texto(msg);

            if (!body) return;

            const lower = body.toLowerCase();

            console.log(
                `[${jidNumber(remetente)}] ${body}`
            );

            // ==========================================
            // TABELA
            // ==========================================

            if (lower === "tabela") {
                await sock.sendMessage(jid, {
                    text: TABELA
                });
                return;
            }

            // ==========================================
            // PAGAMENTO
            // ==========================================

            if (lower === "pagamento") {
                await sock.sendMessage(jid, {
                    text: PAGAMENTO
                });
                return;
            }

            // ==========================================
            // MENU
            // ==========================================

            if (lower === ".menu" || lower === "menu") {

                const menu = `
╭━━〔 ${BOT_NAME} 〕━━╮

📌 GERAL
.menu
.ping
.horas
.id
.jid
.meujid
.dono

📦 COMPRAS
.compra PACOTE
.compras

👑 ADMIN
.ban
.kick
.add
.promover
.rebaixar
.mute
.unmute
.abrir
.fechar

🛡️ PROTEÇÕES
.antilink on/off
.antilinkhard on/off
.antifoto on/off
.antivideo on/off
.antiaudio on/off
.antisticker on/off
.antidocumento on/off
.antiflood on/off

🤖 NANO
.nano texto
.nanoadd
.nanodel
.nanolist
.limparnanos

💰 DONO
.confirmar ID
.cancelar ID
.fila
.limparfila
.clientes
.relatorio
.caixa

╰━━━━━━━━━━━━━━╯
`;

                await sock.sendMessage(jid, {
                    text: menu
                });

                return;
            }

            // ==========================================
            // PING
            // ==========================================

            if (lower === ".ping") {

                await sock.sendMessage(jid, {
                    text: "🏓 PAULO BOT ONLINE!"
                });

                return;
            }

            // ==========================================
            // DONO
            // ==========================================

            if (lower === ".dono") {

                await sock.sendMessage(jid, {
                    text: OWNER_NUMBERS.length
                        ? `👑 Dono configurado: ${OWNER_NUMBERS[0]}`
                        : "⚠️ Configure OWNER_NUMBERS no bot.js"
                });

                return;
            }

            // ==========================================
            // HORAS
            // ==========================================

            if (lower === ".horas") {

                await sock.sendMessage(jid, {
                    text: `🕐 ${new Date().toLocaleString("pt-MZ")}`
                });

                return;
            }

            // ==========================================
            // ID
            // ==========================================

            if (
                lower === ".id" ||
                lower === ".jid" ||
                lower === ".meujid"
            ) {

                await sock.sendMessage(jid, {
                    text:
                        `📌 JID: ${jid}\n` +
                        `👤 Número: ${jidNumber(remetente)}`
                });

                return;
            }

            // ==========================================
            // COMPRA
            // ==========================================

            if (lower.startsWith(".compra")) {

                const partes = body.split(/\s+/);

                if (!partes[1]) {
                    await sock.sendMessage(jid, {
                        text:
                            "❌ Informe o pacote.\n\n" +
                            "Exemplo:\n" +
                            ".compra 410MB"
                    });
                    return;
                }

                const pacote = partes.slice(1).join(" ");

                let megas = parseFloat(
                    pacote
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                );

                if (!megas || megas <= 0) {
                    await sock.sendMessage(jid, {
                        text: "❌ Não consegui identificar os megas."
                    });
                    return;
                }

                const id = gerarID();

                const compra = {
                    id,
                    jid,
                    cliente: remetente,
                    pacote,
                    megas,
                    numero: null,
                    status: "AGUARDANDO_NUMERO",
                    criadoEm: new Date().toISOString()
                };

                compras.push(compra);
                save(FILES.compras, compras);

                await sock.sendMessage(jid, {
                    text:
                        `🛒 COMPRA CRIADA\n\n` +
                        `🆔 ID: ${id}\n` +
                        `📦 Pacote: ${pacote}\n` +
                        `📶 Megas: ${megas}\n\n` +
                        `📱 Agora envie o número que receberá os megas.\n\n` +
                        `Exemplo:\n841234567`
                });

                return;
            }

            // ==========================================
            // NÚMERO DA COMPRA
            // ==========================================

            const compraPendente = compras.find(c =>
                c.cliente === remetente &&
                c.status === "AGUARDANDO_NUMERO"
            );

            if (
                compraPendente &&
                /^\d[\d\s-]{8,}$/.test(body)
            ) {

                const numero = extrairNumero(body);

                if (!numero) return;

                compraPendente.numero = numero;
                compraPendente.status = "AGUARDANDO_PAGAMENTO";
                save(FILES.compras, compras);

                await sock.sendMessage(jid, {
                    text:
                        `✅ Número registrado.\n\n` +
                        `🆔 ID: ${compraPendente.id}\n` +
                        `📱 Número: ${numero}\n` +
                        `📦 Pacote: ${compraPendente.pacote}\n\n` +
                        `💳 Agora faça o pagamento e envie o comprovativo.`
                });

                return;
            }

            // ==========================================
            // COMPRAS
            // ==========================================

            if (lower === ".compras") {

                const minhas = compras.filter(
                    c => c.cliente === remetente
                );

                if (!minhas.length) {
                    await sock.sendMessage(jid, {
                        text: "Você ainda não tem compras."
                    });
                    return;
                }

                let textoCompras =
                    "🛒 SUAS COMPRAS\n\n";

                for (const c of minhas.slice(-10)) {

                    textoCompras +=
                        `🆔 ${c.id}\n` +
                        `📦 ${c.pacote}\n` +
                        `📱 ${c.numero || "Não informado"}\n` +
                        `📌 ${c.status}\n\n`;
                }

                await sock.sendMessage(jid, {
                    text: textoCompras
                });

                return;
            }

            // ==========================================
            // CONFIRMAR PAGAMENTO
            // ==========================================

            if (lower.startsWith(".confirmar")) {

                if (!isOwner(remetente)) {
                    await sock.sendMessage(jid, {
                        text: "❌ Apenas o dono pode confirmar."
                    });
                    return;
                }

                const partes = body.split(/\s+/);

                if (!partes[1]) {
                    await sock.sendMessage(jid, {
                        text:
                            "Use:\n" +
                            ".confirmar MK12345678"
                    });
                    return;
                }

                const id = partes[1].toUpperCase();

                const compra = compras.find(
                    c => c.id === id
                );

                if (!compra) {
                    await sock.sendMessage(jid, {
                        text: "❌ Compra não encontrada."
                    });
                    return;
                }

                if (!compra.numero) {
                    await sock.sendMessage(jid, {
                        text: "❌ A compra ainda não possui número."
                    });
                    return;
                }

                compra.status = "APROVADO";

                save(FILES.compras, compras);

                // ======================================
                // ENVIA PARA MACRODROID
                // ======================================

                try {

                    await enviarMacroDroid({
                        id: compra.id,
                        pacote: compra.pacote,
                        megas: compra.megas,
                        numero: compra.numero
                    });

                    compra.status = "ENVIADO_MACRODROID";

                    save(FILES.compras, compras);

                    await sock.sendMessage(jid, {
                        text:
                            `✅ PAGAMENTO APROVADO\n\n` +
                            `🆔 ${compra.id}\n` +
                            `📦 ${compra.pacote}\n` +
                            `📶 ${compra.megas} MB\n` +
                            `📱 ${compra.numero}\n\n` +
                            `🤖 Pedido enviado ao MacroDroid.\n` +
                            `⏳ Aguardando resultado da transferência...`
                    });

                    // avisa o cliente também
                    await sock.sendMessage(
                        compra.jid,
                        {
                            text:
                                `🤖 Sua transferência foi iniciada.\n\n` +
                                `🆔 ${compra.id}\n` +
                                `📦 ${compra.pacote}\n` +
                                `📱 ${compra.numero}\n\n` +
                                `⏳ Aguarde a confirmação.`
                        }
                    );

                } catch (e) {

                    console.log(
                        "Erro MacroDroid:",
                        e.message
                    );

                    compra.status = "ERRO_MACRODROID";

                    save(FILES.compras, compras);

                    await sock.sendMessage(jid, {
                        text:
                            `❌ Não foi possível contactar o MacroDroid.\n\n` +
                            `ID: ${compra.id}\n\n` +
                            `Verifique se o Webhook do MacroDroid está ativo.`
                    });
                }

                return;
            }

            // ==========================================
            // CANCELAR
            // ==========================================

            if (lower.startsWith(".cancelar")) {

                if (!isOwner(remetente)) return;

                const partes = body.split(/\s+/);
                const id = partes[1]?.toUpperCase();

                const compra = compras.find(
                    c => c.id === id
                );

                if (!compra) {
                    await sock.sendMessage(jid, {
                        text: "❌ Compra não encontrada."
                    });
                    return;
                }

                compra.status = "CANCELADO";

                save(FILES.compras, compras);

                await sock.sendMessage(jid, {
                    text:
                        `❌ Compra ${id} cancelada.`
                });

                await sock.sendMessage(compra.jid, {
                    text:
                        `❌ Sua compra ${id} foi cancelada.`
                });

                return;
            }

            // ==========================================
            // FILA
            // ==========================================

            if (lower === ".fila") {

                if (!isOwner(remetente)) return;

                const pendentes = compras.filter(c =>
                    c.status === "ENVIADO_MACRODROID"
                );

                if (!pendentes.length) {
                    await sock.sendMessage(jid, {
                        text: "📭 Fila vazia."
                    });
                    return;
                }

                let f = "📋 FILA\n\n";

                for (const c of pendentes) {
                    f +=
                        `🆔 ${c.id}\n` +
                        `📦 ${c.pacote}\n` +
                        `📱 ${c.numero}\n\n`;
                }

                await sock.sendMessage(jid, {
                    text: f
                });

                return;
            }

            // ==========================================
            // ADMIN DO GRUPO
            // ==========================================

            if (
                lower.startsWith(".ban") ||
                lower.startsWith(".kick") ||
                lower.startsWith(".add") ||
                lower.startsWith(".promover") ||
                lower.startsWith(".rebaixar") ||
                lower.startsWith(".mute") ||
                lower.startsWith(".unmute") ||
                lower === ".abrir" ||
                lower === ".fechar"
            ) {

                if (!isGroup(jid)) {
                    await sock.sendMessage(jid, {
                        text: "❌ Esse comando só funciona em grupos."
                    });
                    return;
                }

                if (!await somenteAdmin(
                    sock,
                    jid,
                    remetente
                )) {
                    await sock.sendMessage(jid, {
                        text: "❌ Apenas administradores."
                    });
                    return;
                }

                if (!await botIsAdmin(sock, jid)) {
                    await sock.sendMessage(jid, {
                        text:
                            "❌ Preciso ser administrador do grupo."
                    });
                    return;
                }

                const alvo =
                    msg.message?.extendedTextMessage
                        ?.contextInfo
                        ?.participant;

                // BAN / KICK
                if (
                    lower.startsWith(".ban") ||
                    lower.startsWith(".kick")
                ) {

                    if (!alvo) {
                        await sock.sendMessage(jid, {
                            text:
                                "❌ Responda à mensagem da pessoa."
                        });
                        return;
                    }

                    await sock.groupParticipantsUpdate(
                        jid,
                        [alvo],
                        "remove"
                    );

                    await sock.sendMessage(jid, {
                        text: "✅ Membro removido."
                    });

                    return;
                }

                // ADD
                if (lower.startsWith(".add")) {

                    const partes = body.split(/\s+/);
                    const numero = extrairNumero(
                        partes[1] || ""
                    );

                    if (!numero) {
                        await sock.sendMessage(jid, {
                            text:
                                "Use:\n.add 841234567"
                        });
                        return;
                    }

                    await sock.groupParticipantsUpdate(
                        jid,
                        [numero + "@s.whatsapp.net"],
                        "add"
                    );

                    return;
                }

                // PROMOVER
                if (lower.startsWith(".promover")) {

                    if (!alvo) return;

                    await sock.groupParticipantsUpdate(
                        jid,
                        [alvo],
                        "promote"
                    );

                    await sock.sendMessage(jid, {
                        text: "👑 Membro promovido."
                    });

                    return;
                }

                // REBAIXAR
                if (lower.startsWith(".rebaixar")) {

                    if (!alvo) return;

                    await sock.groupParticipantsUpdate(
                        jid,
                        [alvo],
                        "demote"
                    );

                    await sock.sendMessage(jid, {
                        text: "⬇️ Membro rebaixado."
                    });

                    return;
                }

                // ABRIR
                if (lower === ".abrir") {

                    await sock.groupSettingUpdate(
                        jid,
                        "not_announcement"
                    );

                    await sock.sendMessage(jid, {
                        text: "🔓 Grupo aberto."
                    });

                    return;
                }

                // FECHAR
                if (lower === ".fechar") {

                    await sock.groupSettingUpdate(
                        jid,
                        "announcement"
                    );

                    await sock.sendMessage(jid, {
                        text: "🔒 Grupo fechado."
                    });

                    return;
                }
            }

            // ==========================================
            // PROTEÇÕES
            // ==========================================

            const protecaoMatch =
                lower.match(
                    /^\.(antilink|antilinkhard|antifoto|antivideo|antiaudio|antisticker|antidocumento|antiflood)\s+(on|off)$/
                );

            if (protecaoMatch) {

                if (!isGroup(jid)) return;

                if (!await somenteAdmin(
                    sock,
                    jid,
                    remetente
                )) return;

                const nome = protecaoMatch[1];
                const valor = protecaoMatch[2] === "on";

                if (!protecoes[jid]) {
                    protecoes[jid] = {};
                }

                protecoes[jid][nome] = valor;

                save(FILES.protecoes, protecoes);

                await sock.sendMessage(jid, {
                    text:
                        `🛡️ ${nome}: ${valor ? "ATIVADO" : "DESATIVADO"}`
                });

                return;
            }

            // ==========================================
            // NANO
            // ==========================================

            if (lower.startsWith(".nanoadd")) {

                if (!isOwner(remetente)) return;

                const partes = body.split(/\s+/);
                const numero = extrairNumero(
                    partes[1] || ""
                );

                if (!numero) {
                    await sock.sendMessage(jid, {
                        text:
                            "Use:\n.nanoadd 841234567"
                    });
                    return;
                }

                if (!nanos[jid]) nanos[jid] = [];

                if (!nanos[jid].includes(numero)) {
                    nanos[jid].push(numero);
                }

                save(FILES.nanos, nanos);

                await sock.sendMessage(jid, {
                    text: `✅ ${numero} adicionado ao NANO.`
                });

                return;
            }

            if (lower === ".nanolist") {

                const lista = nanos[jid] || [];

                await sock.sendMessage(jid, {
                    text:
                        lista.length
                            ? "🤖 NANO:\n\n" +
                              lista.map(
                                  (n, i) => `${i + 1}. ${n}`
                              ).join("\n")
                            : "📭 NANO vazio."
                });

                return;
            }

            if (lower.startsWith(".nanodel")) {

                if (!isOwner(remetente)) return;

                const partes = body.split(/\s+/);
                const numero = extrairNumero(
                    partes[1] || ""
                );

                if (nanos[jid]) {
                    nanos[jid] =
                        nanos[jid].filter(
                            n => n !== numero
                        );
                }

                save(FILES.nanos, nanos);

                await sock.sendMessage(jid, {
                    text: "✅ NANO removido."
                });

                return;
            }

            if (lower === ".limparnanos") {

                if (!isOwner(remetente)) return;

                nanos[jid] = [];

                save(FILES.nanos, nanos);

                await sock.sendMessage(jid, {
                    text: "🗑️ Lista NANO limpa."
                });

                return;
            }

            // ==========================================
            // RESPOSTA AUTOMÁTICA DO NANO
            // ==========================================

            const listaNano = nanos[jid] || [];

            if (
                listaNano.includes(
                    jidNumber(remetente)
                )
            ) {

                await sock.sendMessage(jid, {
                    text: "🤖 NANO ativo."
                });

                return;
            }

        } catch (e) {

            console.log(
                "Erro processando mensagem:",
                e
            );
        }
    });

    // ==================================================
    // PARTICIPANTES
    // ==================================================

    sock.ev.on(
        "group-participants.update",
        async update => {

            try {

                const { id, participants, action } =
                    update;

                if (action === "add") {

                    for (const user of participants) {

                        await sock.sendMessage(id, {
                            text:
                                `👋 Bem-vindo(a)!\n\n` +
                                `@${jidNumber(user)}\n\n` +
                                `Digite *Tabela* para ver os pacotes.`
                            ,
                            mentions: [user]
                        });
                    }
                }

            } catch (e) {
                console.log(
                    "Erro welcome:",
                    e.message
                );
            }
        }
    );
}

iniciar();
