// Copyright 2013 Richard Woodbury
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

'use strict';

window.onload = function() {
  var connectButton = document.querySelector('#connect');
  connectButton.onclick = onConnectClick;
  var sshModeButton = document.querySelector('#ssh-mode');
  sshModeButton.onchange = updateMode;
  var manualModeButton = document.querySelector('#manual-mode');
  manualModeButton.onchange = updateMode;
  var form = document.querySelector('#args');
  form.onsubmit = function() { return false; };
  updateMode();
};

function execMosh() {
  var args = {}
  var form = document.querySelector('#args');
  args['addr'] = form['addr'].value;
  args['port'] = form['port'].value;
  args['user'] = form['user'].value;
  args['key'] = form['key'].value;
  for (var i = 0; i < form['mode'].length; ++i) {
    if (form['mode'][i].checked) {
      args['mode'] = form['mode'][i].value;
      break;
    }
  }

  var setup = document.querySelector('#setup');
  setup.parentNode.removeChild(setup);

  var terminal = new hterm.Terminal('mosh');
  terminal.decorate(document.querySelector('#terminal'));
  terminal.onTerminalReady = function() {
    terminal.setCursorPosition(0, 0);
    terminal.setCursorVisible(true);
    terminal.runCommandClass(mosh.CommandInstance, args);
  };

  document.title += ' - ' + args.addr;

  // Useful for console debugging.
  window.term_ = terminal;
};

function onConnectClick(e) {
  lib.init(execMosh, console.log.bind(console));
};

function updateMode(e) {
  var sshModeButton = document.querySelector('#ssh-mode');
  var portField = document.querySelector('#port');
  var usernameRow = document.querySelector('#username-row');
  var keyRow = document.querySelector('#key-row');

  if (sshModeButton.checked) {
    portField.value = 22;
    usernameRow.hidden = false;
    keyRow.hidden = true;
  } else {
    portField.value = 60001;
    usernameRow.hidden = true;
    keyRow.hidden = false;
  }
}

var mosh = {};

mosh.CommandInstance = function(argv) {
  // Command arguments.
  this.argv_ = argv;

  // Command environment.
  this.environment_ = argv.environment || {};

  // hterm.Terminal.IO instance.
  this.io = null;
};

mosh.CommandInstance.run = function(argv) {
  return new nassh.CommandInstance(argv);
};

mosh.CommandInstance.prototype.run = function() {
  // Useful for console debugging.
  window.mosh_client_ = this;

  this.io = this.argv_.io.push();
  this.io.onVTKeystroke = this.sendKeyboard_.bind(this);
  this.io.sendString = this.sendKeyboard_.bind(this);
  this.io.onTerminalResize = this.onTerminalResize_.bind(this);

  this.moshNaCl_ = window.document.createElement('embed');
  this.moshNaCl_.style.cssText = (
      'position: absolute;' +
      'top: -99px' +
      'width: 0;' +
      'height: 0;');
  this.moshNaCl_.setAttribute('src', 'mosh_client.nmf');
  this.moshNaCl_.setAttribute('type', 'application/x-pnacl');
  this.moshNaCl_.setAttribute('key', this.argv_.argString['key']);
  this.moshNaCl_.setAttribute('addr', this.argv_.argString['addr']);
  this.moshNaCl_.setAttribute('port', this.argv_.argString['port']);
  this.moshNaCl_.setAttribute('user', this.argv_.argString['user']);
  this.moshNaCl_.setAttribute('mode', this.argv_.argString['mode']);
  if (window.ssh_key) {
    this.moshNaCl_.setAttribute('ssh_key', window.ssh_key);
    // Delete the key for good measure, although it is still available in local
    // storage.
    delete window.ssh_key;
  }

  // Delete argv_, as it contains sensitive info.
  delete this.argv_;

  this.moshNaCl_.addEventListener('load', function(e) {
    window.mosh_client_.io.print('loaded.\r\n');
    // Remove sensitive argument attributes.
    window.mosh_client_.moshNaCl_.removeAttribute('key');
  });
  this.moshNaCl_.addEventListener('message', this.onMessage_.bind(this));
  this.moshNaCl_.addEventListener('crash', function(e) {
    window.mosh_client_.io.print('\r\nMosh NaCl crashed.\r\n');
    console.log('Mosh NaCl crashed.');
  });

  this.io.print("Loading NaCl module (takes a while the first time" +
      " after an update)... ");
  document.body.insertBefore(this.moshNaCl_, document.body.firstChild);
};

mosh.CommandInstance.prototype.onMessage_ = function(e) {
  var data = e.data['data'];
  var type = e.data['type'];
  if (type == 'display') {
    this.io.print(data);
  } else if (type == 'log') {
    console.log(String(data));
  } else if (type == 'error') {
    // TODO: Find a way to output errors that doesn't interfere with the
    // terminal window.
    var output = String(data);
    if (output.search('\r\n') == -1) {
      output = output.replace('\n', '\r\n');
    }
    this.io.print(output + '\r\n');
    console.error(output);
  } else if (type == 'get_ssh_key') {
    var thiz = this;
    chrome.storage.local.get('ssh_key', function(o) {
      thiz.moshNaCl_.postMessage({'ssh_key': o['ssh_key']});
    });
  } else {
    console.log('Unknown message type: ' + JSON.stringify(e.data));
  }
};

mosh.CommandInstance.prototype.sendKeyboard_ = function(string) {
  this.moshNaCl_.postMessage({'keyboard': string});
};

mosh.CommandInstance.prototype.onTerminalResize_ = function(w, h) {
  // Send new size as an int, with the width as the high 16 bits.
  this.moshNaCl_.postMessage({'window_change': (w << 16) + h});
};
