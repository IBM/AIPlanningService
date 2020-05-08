var fs = require('fs-extra');
var path = require('path');

exports.store = function(filepath, destfname, args) {
    let destpath = path.join(args.path, destfname);
    return fs.copy(filepath, destpath).then(() => {
        console.log("Copied file " + filepath + " to " + args.path);
        return true; // make sure to return constant promises this way
    }).catch(store_err => {
        console.error("Error storing " + filepath + " to " + destpath + " with technique nfs.");
    });
}