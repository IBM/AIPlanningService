const http = require('http');
const fs = require('fs');

var myargs = process.argv.slice(2);

if(myargs.length < 2) {
    console.log("You must provide a domain and problem file.");
    process.exit(1);
}

const dom = fs.readFileSync(myargs[0], 'utf-8');
const prob = fs.readFileSync(myargs[1], 'utf-8');
const k = ((myargs.length > 2) ? parseInt(myargs[2]) : 5) || 5;

const body = {
    domain: dom,
    problem: prob,
    numplans: k
};

let req = http.request("http://localhost:4501/planners/topk", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
}, res => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log('BODY follows:======');
      console.log(JSON.stringify(JSON.parse(chunk), null, 2));
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify(body));
req.end();