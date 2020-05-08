var nconf = require('nconf');
const path = require('path');
const fs = require('mz/fs');

nconf.use("memory");
nconf.argv();
nconf.env({ separator: "__" });
var conffile = (nconf.get("conf") || "default-unified.json");
var confpath = path.join(__dirname, "config", conffile);
if (fs.existsSync(confpath) && fs.statSync(confpath).isFile()) {
    nconf.file(confpath);
}

module.exports = nconf;