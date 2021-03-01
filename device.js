import NikonClient from './index.js';


const nw = new NikonClient({ timeout: 5000, verbose: true });


nw.openSession('192.168.1.1').then((deviceInfo) => console.log('Got info', deviceInfo));