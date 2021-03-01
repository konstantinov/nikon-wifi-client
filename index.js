import { Socket } from 'net';

const MTP_TCPIP_REQ_INIT_CMD_REQ           = '00000001';
const MTP_TCPIP_REQ_INIT_EVENTS            = '00000003';
const MTP_TCPIP_REQ_PROBE                  = '0000000d';

const MTP_TCPIP_PAYLOAD_ID_COMMAND_REQUEST   = '00000006';
const MTP_TCPIP_PAYLOAD_ID_COMMAND_RESPONSE  = '00000007';
const MTP_TCPIP_PAYLOAD_ID_DATA_PAYLOAD      = '0000000a';
const MTP_TCPIP_PAYLOAD_ID_DATA_PAYLOAD_LAST = '0000000c';

const MTP_OP_GET_DEVICE_INFO     = '1001';

const SESSION_ACK               = 2;
const PROBES_ACK = '0e';

const MTP_DATA_DIRECTION_NONE				= '00000000';
const MTP_DATA_DIRECTION_CAMERA_TO_HOST     = '00000001';
const MTP_DATA_DIRECTION_HOST_TO_CAMERA     = '00000002';

const REQUEST_DATA_DIRECTION = {
    [MTP_OP_GET_DEVICE_INFO]: MTP_DATA_DIRECTION_CAMERA_TO_HOST,
};

const format = (string, len, fill = '0' ) => {
    const long = fill.repeat(len) + string;

    return long.substr(long.length - len);
};
class NikonClient {
	dataListeners = [];
	eventsListeners = [];
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
    }
    send(socket = this.client, msg = this.msg) {
        this.lastEventsAnswer = Buffer.from('');
        this.lastAnswer = Buffer.from('');
        const length = msg.length + 4;

        const buffer = Buffer.concat([
            Buffer.from(format(length.toString(16), 8), 'hex').reverse(),
            msg
        ]);

        msg = Buffer.from('');

        this.settings.verbose && console.log('Sending', buffer);
        socket.write(buffer);

    }
    parseSession(data) {
        return new Promise((resolve, reject) => {

            const status = this.getInt(data);

            if (status !== SESSION_ACK || data.length < 8) {
                this.settings.verbose && console.log(`Got bad session status = ${status.toString(16)}`, data);

                return reject(data);
            }

            this.sessionId = this.getInt(data.slice(4));
            this.settings.verbose && console.log(`Session initialized sessionId = ${this.sessionId.toString(16)}`);
            resolve(this.sessionId);
        });
    }
    sendInitEvents() {
        return new Promise(resolve => {
            this.eventsMsg = this.append(Buffer.from(MTP_TCPIP_REQ_INIT_EVENTS, 'hex'), this.eventsMsg);
            this.eventsMsg = this.append(Buffer.from(format(this.sessionId.toString(16), 8), 'hex'), this.eventsMsg);

            this.addEventsListeners(() => resolve());

            this.eventsMsg = this.send(this.eventsClient, this.eventsMsg);
        });
    }
    sendProbes() {
        return new Promise((resolve, reject) => {
            this.eventsMsg = this.append(Buffer.from(MTP_TCPIP_REQ_PROBE, 'hex'), this.eventsMsg);

            this.addEventsListeners((response) => {
                const status = this.getInt(response);

                if (status == parseInt(PROBES_ACK, 16))
                    resolve();
                else
                    reject(response);
            });

            this.eventsMsg = this.send(this.eventsClient, this.eventsMsg);
        });
    }
    initEventsClient() {
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

                this.sendInitEvents().then(() => this.sendProbes()).then(() => resolve());
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
            this.transactionId = 0;
            this.addDataListener(data =>
                this
                    .parseSession(data)
                    .then(() => this.initEventsClient())
                    .then(() => this.getDeviceInfo())
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
    addEventsListeners(listener) {
        this.eventsListeners.push(listener);
    }
    getInt(data) {
        const intBuffer = Buffer.from(data.slice(0, 4));

        return parseInt(intBuffer.reverse().toString('hex'), 16);
    }
    handleEventsData(data) {
        if (this.lastEventsAnswer.length === 0)
            this.settings.verbose && console.log('Getting events response...');

        this.lastEventsAnswer = Buffer.concat([
            this.lastEventsAnswer,
            data,
        ]);

        const messageSize = this.getInt(this.lastEventsAnswer);

        if (messageSize === this.lastEventsAnswer.length) {
            this.settings.verbose && console.log(`Got events response ${messageSize} bytes ${this.lastEventsAnswer.toString('hex')}`);
            const message = this.lastEventsAnswer.slice(4);

            this.eventsListeners.forEach(listener => listener(message));
            this.eventsListeners = [];
        }
    }
    handleData(data) {

        this.lastAnswer = Buffer.concat([
            this.lastAnswer,
            data,
        ]);

        const messageSize = this.getInt(this.lastAnswer);
        if (messageSize <= this.lastAnswer.length) {
            this.settings.verbose && console.log(`Got response ${messageSize} bytes`);

            const message = this.lastAnswer.slice(4, messageSize);

            const listeners = this.dataListeners;
            this.dataListeners = [];
            listeners.forEach(listener => listener(message));
            this.lastAnswer = Buffer.from(this.lastAnswer.slice(messageSize));

            this.settings.verbose && console.log(`Message buffer has ${this.lastAnswer.length} bytes in the queue`);
        }
    }
    getDeviceInfo() {
        return new Promise((resolve) => {
            this.settings.verbose && console.log('Gettig device info');

            this.msg = this.append(Buffer.from(MTP_TCPIP_PAYLOAD_ID_COMMAND_REQUEST, 'hex'), Buffer.from(''));
            this.msg = this.append(Buffer.from(REQUEST_DATA_DIRECTION[MTP_OP_GET_DEVICE_INFO], 'hex'));
            this.msg = this.append(Buffer.from(MTP_OP_GET_DEVICE_INFO, 'hex'));

            this.transactionId++;
            this.msg = this.append(Buffer.from(
                format(this.transactionId.toString(16), 8),
                'hex'
            ));

            let parse; parse = (data) => {
                const dataType = this.getInt(data);

                if (dataType === parseInt(MTP_TCPIP_PAYLOAD_ID_COMMAND_RESPONSE, 16)) {
                    this.addDataListener(parse);
                    return;
                }


                if (dataType === parseInt(MTP_TCPIP_PAYLOAD_ID_DATA_PAYLOAD_LAST, 16)) {
                    resolve(data.slice(8));
                    return;
                }

                this.addDataListener(parse);
            };

            this.addDataListener(parse);

            this.lastAnswer = Buffer.from('');
            this.msg = this.send();

        }).then((binaryDeviceInfo) => {

            const [ stdVersion, vendorExtId, vendorExtVersion ] = [
                { from: 0, to: 2 },
                { from: 2, to: 6 },
                { from: 6, to: 8 },
            ].map(({ from, to }) => parseInt(binaryDeviceInfo.slice(from, to).reverse().toString('hex'), 16));

            let offset = 8;
            const vendorExtDesc = this.getCountedString(binaryDeviceInfo.slice(offset));

            offset += 5 + vendorExtDesc.length * 2;
            const supportedOperations = this.getCountedList(binaryDeviceInfo.slice(offset));


            offset += 4 + supportedOperations.length * 2;
            const supportedEvents     = this.getCountedList(binaryDeviceInfo.slice(offset));

            offset += 4 + supportedEvents.length * 2;
            const devocePropertiesSupport     = this.getCountedList(binaryDeviceInfo.slice(offset));

            offset += 4 + devocePropertiesSupport.length * 2;
            const captureFormatSupport     = this.getCountedList(binaryDeviceInfo.slice(offset));

            offset += 4 + captureFormatSupport.length * 2;

            const imageFormSupport = this.getCountedList(binaryDeviceInfo.slice(offset));

            offset += 4 + imageFormSupport.length * 2;

            const manufacturer = this.getCountedString(binaryDeviceInfo.slice(offset));

            offset += 3 + manufacturer.length * 2;
            const model = this.getCountedString(binaryDeviceInfo.slice(offset));


            offset += 3 + manufacturer.length * 2;
            const deviceVersion = this.getCountedString(binaryDeviceInfo.slice(offset));

            return {
                stdVersion, vendorExtId, vendorExtVersion, vendorExtDesc, supportedOperations, supportedEvents,
                devocePropertiesSupport, captureFormatSupport, imageFormSupport, manufacturer, model, deviceVersion
            };
        });
    }
    getCountedList(data, size=2) {
        const length = this.getInt(data);

        const list = [];
        for (let i = 1; i<=length; i++) {
            const position = 4 + (i - 1)*size;
            list.push(data.slice(position, position + size).reverse().toString('hex'));
        }
        return list;
    }
    getCountedString(data) {

        const length = parseInt(data.slice(0, 1).toString('hex'), 16);

        if (length === 0)
            return '';
        return data.slice(1, 2*length - 2).filter(code => code > 0).toString();
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
