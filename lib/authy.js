var async = require('async');
var speakeasy = require('speakeasy');

var Secret = require('./models/secret');

function serviceProviderAlias(alias) {
  var lowerCaseAlias = alias.toLowerCase();
  switch (lowerCaseAlias) {
  case 'do':
  case 'digitalocean':
    return 'DigitalOcean';
  default:
    return alias;
  }
}
function serviceProviderLogo(serviceProvider) {
  switch (serviceProvider) {
  case 'DigitalOcean':
    return 'https://authy.tenten.co/img/DigitalOcean_logo.jpg';
  case 'AWS':
    return 'https://authy.tenten.co/img/AmazonWebservices_Logo.png';
  default:
    return 'https://authy.tenten.co/img/DigitalOcean_logo.jpg';
  }
}

function ls(roomId, cb) {
  async.waterfall([
    function(cb) {
      Secret.find()
      .select({
        roomId: roomId,
        label: 1
      })
      .exec(cb);
    },
    function(secrets, cb) {
      var html = '';
      if (secrets !== null && secrets.length > 0) {
        html += '<ul>';
        secrets.forEach(function(secret) {
          html += '<li>' + secret.label + '</li>';
        });
        html += '</ul>';
      } else {
        html += '目前尚未添加任何鑰匙，使用 <b>/authy add <keyUri></b> 來添加新鑰匙吧！';
      }
      cb(null, {
        message: html
      });
    }
  ], cb);
}

function token() {
  if (arguments.length === 3) {
    var label = arguments[1];
    if (label.match(':') !== null) {
      label = label.split(':');
      var serviceProvider = serviceProviderAlias(label[0]);
      label = serviceProvider + ':' + label[1];
    }
    var query = {
      roomId: arguments[0],
      label: label
    };
    var cb =  arguments[2];
  } else if (arguments.length === 4) {
    var serviceProvider = serviceProviderAlias(arguments[1]);
    var query = {
      roomId: arguments[0],
      serviceProvider: serviceProvider,
      identity: arguments[2]
    };
    var cb =  arguments[3];
  } else {
    var args = Array.prototype.slice.call(arguments);
    args.pop();
    args.shift();
    throw new Error('invalid arguments: ' + args);
  }
  Secret.findOne(query, function(err, secret) {
    try {
      if (err) {
        throw err;
      }
      if (secret === null) {
        throw new Error('invalid arguments');
      }
      var token = speakeasy.totp({
        secret: secret.secret,
        encoding: 'base32'
      });
      var serviceImage = serviceProviderLogo(secret.serviceProvider);
      cb(null, {
        message: token,
        card: {
          style: 'link',
          id: secret.label + '-' + token,
          title: secret.label + ' OTP',
          description: token,
          thumbnail: {
            url: serviceImage,
            width: 200,
            height: 200
          }
        }
      });
    } catch (err) {
      return cb(err);
    }
  });
}

function help(cb) {
  cb(null, {
    message: '<b>Usage: /authy <span style="color: red">[<cmd>]</span> <span style="color: blue">[<args>]</span></b> \
    <ul> \
    <li><span style="color: red">help</span>: show this help message</li> \
    <li><span style="color: red">ls</span>: show all labels</li> \
    <li><span style="color: blue"><label></span> or <span style="color: blue"><serviceProvider> <identity></span>: get token</li> \
    <li><span style="color: red">add</span> <span style="color: blue"><keyUri></span>: add new key with <a href="https://github.com/google/google-authenticator/wiki/Key-Uri-Format">specified format</a></li> \
    <li><span style="color: red">rm</span> <span style="color: blue"><label></span>: remove key by label</li> \
    </ul>'
  });
}

function add(roomId, uri, cb) {
  try {
    if (! Secret.uriPattern.test(uri)) {
      throw new Error('invalid uri: ' + uri);
    }
    var key = uri.match(Secret.uriPattern);
    var serviceProvider = key[2].replace(/^((.+):)?([^:]+)$/, '$2');
    var identity = key[2].replace(/^((.+):)?([^:]+)$/, '$3');
    var parameters = key[3].split('&');
    var secret = '',
    issuer = '';
    parameters.forEach(function(param) {
      var param = param.split('=');
      if (param[0] === 'secret') {
        secret = param[1];
      } else if (param[0] === 'issuer') {
        issuer = param[1];
      }
    });
    Secret.findOne({
      roomId: roomId,
      label: key[2]
    }, function(err, secret) {
      try {
        if (err) {
          throw err;
        }
        if (secret !== null) {
          throw new Error('label: ' + key[2] + ' has existed, use /authy ' + key[2] + ' to get token.');
        }
        var secret = new Secret({
          roomId: roomId,
        	type: key[1],
        	label: key[2],
        	serviceProvider: serviceProvider,
        	identity: identity,
        	secret: secret,
        	issuer: issuer
        });
        secret.save();
        token(roomId, secret.label, cb);
      } catch (err) {
        return cb(err);
      }
    });
  } catch (err) {
    cb(err);
  }
}

function rm(roomId, label, cb) {
  try {
    Secret.find({
      roomId: roomId,
      label: label
    })
    .remove(function(err) {
      if (err) {
        return cb(err);
      }
      cb(null, {
        message: '<b>' + label + '</b> 刪除成功'
      });
    });
  } catch (err) {
    return cb(err);
  }
}

function permissionDeny(method, cb) {
  cb(null, {
    message: '你沒有操作 <b>' + method + '</b> 的權限'
  });
}

function passRoomIdToFunction(roomId, func) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(roomId);
    func.apply(null, args);
  };
}

var _methods = function(roomId) {
  return {
    ls: passRoomIdToFunction(roomId, ls),
    token: passRoomIdToFunction(roomId, token),
    help: help,
    add: passRoomIdToFunction(roomId, add),
    rm: passRoomIdToFunction(roomId, rm),
    permissionDeny: permissionDeny
  };
};

var adminMethods = ['add', 'rm'];
function couldBeExecuted(method) {
  return adminMethods.indexOf(method) === -1;
}

module.exports = function(req, res, cb) {
  try {
    var args = req.authy.args,
    method = req.authy.method;
    var isAdmin = req.room.owner.toString() === req.identity.userId.toString();
    if (! isAdmin && ! couldBeExecuted(method)) {
      permissionDeny(method, cb);
    } else {
      args.push(cb);
      req.methods[method].apply(null, args);
    }
  } catch (err) {
    return cb(err);
  }
};
module.exports.parse = function(req, res, next) {
  try {
    var message = req.body.item.message.message;
    var args = message.replace(/^\/authy\s*(\S.*)?$/, '$1').match(/(\S+)/g);
    req.methods = _methods(req.clientInfo.roomId);
    var method = '';
    if (args === null) {
      method = 'help';
      args = [];
    } else if (typeof req.methods[args[0]] === 'function') {
      method = args.shift();
    } else {
      method = 'token';
    }
    req.authy = {
      method: method,
      args: args
    };
  } catch (err) {
    console.error(err);
  }
  next();
};
