const net = require("net");
const fs = require("fs");
const path = require("path");

const PORT = 8324;

// Folder containing simulator images
const IMAGE_DIR = path.join(__dirname, "simulatorImages");

let lastImageSentTime = 0;
const IMAGE_INTERVAL = 60 * 1000; // 1 minute

// Default image
function getImage(ip) {

    const file = path.join(
        IMAGE_DIR,
        ip.replace(/\./g, "_") + ".jpg"
    );

    if (fs.existsSync(file)) {
        console.log("Using", file);
        return fs.readFileSync(file);
    }

    const fallback = path.join(IMAGE_DIR, "sample.jpg");

    console.log("Using default image");

    return fs.readFileSync(fallback);

}

const server = net.createServer((socket) => {

    const now = Date.now();

    if (now - lastImageSentTime < IMAGE_INTERVAL) {

        console.log("========================================");
        console.log("ReadImage Connected");
        console.log("Skipping image (1 minute interval not completed)");
        console.log("========================================");

        socket.end();   // Close connection without sending image
        return;
    }

    lastImageSentTime = now;

    console.log("========================================");
    console.log("ReadImage Connected");
    console.log("Client:", socket.remoteAddress + ":" + socket.remotePort);

    try {

        const clientIP =
            socket.localAddress.replace(/^::ffff:/, "");

        const image = getImage(clientIP);

        const header = image.length.toString().padStart(8, "0");

        console.log("Image Size :", image.length);
        console.log("Header     :", header);

        socket.write(Buffer.from(header, "ascii"));

        let sent = 0;
        const CHUNK = 4096;

        while (sent < image.length) {

            const end = Math.min(sent + CHUNK, image.length);

            socket.write(image.slice(sent, end));

            sent = end;
        }

        console.log("Transfer Complete");

        socket.end();

    } catch (err) {

        console.error(err);

        socket.destroy();

    }

});

server.on("error", err => {

    console.error(err);

});

function startImageSimulator() {

    server.listen(PORT, () => {

        console.log("--------------------------------");
        console.log("Image Simulator Started");
        console.log("Port :", PORT);
        console.log("--------------------------------");

    });

}

module.exports = {
    startImageSimulator
};