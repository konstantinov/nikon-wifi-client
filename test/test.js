

import { expect } from 'chai';
import NikonClient from '../index.js';

describe('Util functions', () => {
    it('getInt', (done) => {
        const nc = new NikonClient();
        let buf = Buffer.from('01000000', 'hex');
        expect(nc.getInt(buf)).to.equal(1);

        buf = Buffer.from('01', 'hex');
        expect(nc.getInt(buf)).to.equal(1);
        done();
    });

    it('append', (done) => {
        const nc = new NikonClient();
        let buf = Buffer.from('');

        buf = nc.append(Buffer.from([0]));
        expect(buf.length).to.eq(1);
        expect(buf[0]).to.eq(0);

        buf = nc.append(Buffer.from(''), buf);
        expect(buf.length).to.eq(1);


        buf = nc.append(Buffer.from('01', 'hex'), buf);
        expect(buf[0]).to.eq(0);
        expect(buf[1]).to.eq(1);
        done();

    });

    it('send', (done) => {
        const socketMock = { write: (data) => expect(data.toString('hex')).to.eq('090000001234567890') };

        const nc = new NikonClient();

        nc.send(socketMock, Buffer.from('1234567890', 'hex'));
        done();
    })
})