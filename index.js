import { Socket } from 'net';

const MTP_TCPIP_REQ_INIT_CMD_REQ = '00000001';
const MTP_TCPIP_REQ_INIT_EVENTS  = '00000003';
const SESSION_ACK = 2;

const format = (string, len, fill = '0' ) => {
    const long = fill.repeat(len) + string;

    return long.substr(long.length - len);
}
class NikonClient {
    dataListeners = [];
    msg = Buffer.from('');
    eventsMsg = Buffer.from('');
    constructor(settings = {}) {
        this.settings = {
            guid: 'ffeeddccbbaa99887766554433221100',
            hostVersion: '00000001',
            hostName: 'NodeJS NikonOverWifi/1.0',
            defaultPort: 15740,
            timeout: 60000,
            verbose: false,
            ...settings
        };

    }
    append(buffer, msg = this.msg) {
        return Buffer.concat([ msg, buffer.reverse() ]);
        // console.log(msg);
    }
    send(socket = this.client, msg = this.msg) {
        const length = msg.length + 4;
        // console.log(msg);
        const buffer = Buffer.concat([
            Buffer.from(format(length.toString(16), 8), 'hex').reverse(),
            msg
        ]);

        msg = Buffer.from('');

        // console.log('Sending ' + buffer.toString());
        // console.log(buffer);
        // console.log('<Buffer 2a 00 00 00 01 00 00 00 00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff 61 00 69 00 72 00 6e 00 65 00 66 00 00 00 01 00 00 00>');
        this.lastAnswer = Buffer.from('');
        this.settings.verbose && console.log(`Sending ${buffer.toString('hex'    )}`);
        socket.write(buffer);

    }
    parseSession(data) {
        return new Promise((resolve, reject) => {
            // console.log(data);
            const status = this.getInt(data);
            // console.log(status);

            if (status !== SESSION_ACK || data.length < 8) {
                this.settings.verbose && console.log(`Got bad session status = ${status.toString(16)}`, data);

                return reject(data);
            }

            this.sessionId = this.getInt(data.slice(4));
            this.settings.verbose && console.log(`Session initialized sessionId = ${this.sessionId.toString(16)}`);
            resolve(this.sessionId);
        })
    }
    handleEventsData(data) {
        console.log('Events data received ' + data.toString('hex'));
    }
    initEventsClient(sessionId) {
        this.settings.verbose && console.log('Initializing events socket client...');

        this.eventsClient = new Socket();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.eventsClient.destroy();

                reject(new Error('Connection timeout'));
            }, this.settings.timeout);

            this.eventsClient.connect(this.port, this.address, () => {
                clearTimeout(timeout);
                this.settings.verbose && console.log(`Connected to ${this.address}:${this.port}`);
                this.eventsClient.on('data', (data) => this.handleEventsData(data));

                this.eventsMsg = this.append(Buffer.from(MTP_TCPIP_REQ_INIT_EVENTS, 'hex'), this.eventsMsg);
                // console.log(this.events)
                this.eventsMsg = this.append(Buffer.from(format(this.sessionId.toString(16), 8), 'hex'), this.eventsMsg)

                this.eventsMsg = this.send(this.eventsClient, this.eventsMsg);

                resolve();
            });
            this.client.on('close', () => {
                this.settings.verbose && console.log('Events connection closed');
            });
        });

    }
    initSession() {
        return new Promise((resolve) => {
            this.msg = this.append(Buffer.from(MTP_TCPIP_REQ_INIT_CMD_REQ, 'hex'));
            this.msg = this.append(Buffer.from(this.settings.guid, 'hex'));
            const utf16string = this.settings.hostName.replace(/(.)/g, '$1\0') + '\0\0';

            this.msg =  this.append(Buffer.from(utf16string).reverse());
            this.msg =  this.append(Buffer.from(this.settings.hostVersion, 'hex'));
            this.addDataListener(data =>
                this
                    .parseSession(data)
                    .then((sessionId) => this.initEventsClient(sessionId))
                    .then(resolve)
            );
            this.settings.verbose && console.log('Initializing session...');
            this.send();
            this.msg = Buffer.from('');
        });
    }
    addDataListener(listener) {
        this.dataListeners.push(listener);
    }
    getInt(data) {
        return parseInt(data.slice(0, 4).reverse().toString('hex'), 16);
    }
    handleData(data) {
        if (this.lastAnswer.length === 0)
            this.settings.verbose && console.log('Getting response...');

        this.lastAnswer = Buffer.concat([
            this.lastAnswer,
            data,
        ]);

        const messageSize = this.getInt(this.lastAnswer);

        if (messageSize == this.lastAnswer.length) {
            this.settings.verbose && console.log(`Got response ${messageSize} bytes`);
            const message = this.lastAnswer.slice(4);
            // console.log(message);
            this.dataListeners.forEach(listener => listener(message));
            this.dataListeners = [];
        }
    }
    openSession(address, port = this.settings.defaultPort) {
        this.settings.verbose && console.log(`Connecting ${address}:${port}`);
        this.client = new Socket();
        this.port = port;
        this.address = address;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.client.destroy();

                reject(new Error('Connection timeout'));
            }, this.settings.timeout);

            this.client.connect(port, address, () => {
                clearTimeout(timeout);
                this.settings.verbose && console.log(`Connected to ${address}:${port}`);
                this.client.on('data', (data) => this.handleData(data));

                this.initSession().then(resolve);
            });
            this.client.on('close', () => {
                this.settings.verbose && console.log('Connection closed');
            });
        });
    }
}
export default NikonClient;
