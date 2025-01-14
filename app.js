const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const WebSocket = require("ws");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");

const app = express();

// Middleware di Express
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);

// Funzione per configurare WebSocket
app.setupWebSocket = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("Nuovo client connesso!");

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const history = [
      {
        role: "user",
        parts: [{ text: "Ciao" }],
      },
      {
        role: "model",
        parts: [{ text: "Come posso esserti utile?" }],
      },
    ];

    ws.on("message", async (message) => {
      try {
        const stringMessage = message.toString();

        // Rimuove eventuali doppi apici extra
        const cleanMessage = stringMessage.startsWith('"')
          ? JSON.parse(stringMessage)
          : stringMessage;

        // Parsing del messaggio JSON
        const parsedMessage = JSON.parse(cleanMessage);

        console.log("Messaggio ricevuto:", parsedMessage.msg);

        history.push({
          role: "user",
          parts: [{ text: parsedMessage.text }],
        });

        const chat = model.startChat({ history });

        if (parsedMessage.role === "user") {
          console.log("Messaggio ricevuto dall'utente:", parsedMessage);
          // Rispondi al client con un messaggio di conferma
          ws.send(
            JSON.stringify({
              status: "success",
              text: parsedMessage.text,
              role: parsedMessage.role,
            })
          );
          // Invia il messaggio all'IA

          const prompt = parsedMessage.text;

          const result = await chat.sendMessageStream(prompt);

          let response = "";

          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            console.log("Messaggio inviato dall ia:", chunkText);
            console.log(result);

            response += chunkText;

            ws.send(
              JSON.stringify({
                status: "success",
                text: chunkText,
                role: "ia",
              })
            );
          }

          history.push({
            role: "model",
            parts: [{ text: response }],
          });
          //console.log(await chat.getHistory());
        } else {
          console.log("Messaggio ricevuto dall'ia:", parsedMessage);
        }
      } catch (error) {
        console.error("Errore nel parsing del messaggio:", error);

        // Rispondi al client con un messaggio di errore, senza interrompere la connessione
        ws.send(
          JSON.stringify({
            status: "error",
            message: "Il messaggio inviato non è valido.",
          })
        );
      }
    });

    ws.on("close", () => {
      console.log("Client disconnesso");
    });
  });
};

module.exports = app;
