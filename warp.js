var peer = new Peer(null, {host: 'peer.sendfiles.direct', port: 9000, path:'/myapp'});

function $id(s) { return document.getElementById(s); }
function $txt(s) { return document.createTextNode(s); }
function $e(s) { return document.createElement(s); }

var connectState = 0;
var connection = null;
var localFiles = {};
var localFileCounter = {};
var nextFileId = 1;
var remoteFilenames = {};
var remoteFilesizes = {};
var remoteFileData = {};
var remoteFileRcvd = {}
var remoteFilecount = 0;

peer.on('error', function peerError(err) {
  if (err.type == 'peer-unavailable') {
    alert('Computer ID not found.');
    $id('connection').className = 'waiting';
    connectState++;
  } else if (err.type === 'browser-incompatible') {
    $id('connection').className = 'incompatible';
  } else {
    alert('Internal Error');
    console.log('Peer error:' + err.type);
    console.log(err);
  }
});

function isFileComplete(id) {
  var lastChunkIdx = Math.ceil(remoteFilesizes[id] / 16384) - 1;
  for (var i = lastChunkIdx; i >= 0; --i) {
    if (remoteFileData[id][i] === undefined) {
      return false;
    }
  }
  return true;
}

function finishFile(id) {
  var received = new window.Blob(remoteFileData[id]);
  remoteFileData[id] = []

  var downloadElt = $id('download' + id);
  downloadElt.href = URL.createObjectURL(received);
  downloadElt.download = remoteFilenames[id];

  $id('avail' + id).className = 'availableFile done';
}

function receivedFileChunk(id, d, i) {
  console.log("ReceivedFileChunk: " + i + " " + d.byteLength);
  remoteFileData[id][i] = d;
  remoteFileRcvd[id] += d.byteLength;
  if (isFileComplete(id)) {
    finishFile(id);
  } else {
    var thousandths = Math.floor(remoteFileRcvd[id] * 1000 / remoteFilesizes[id]);
    $id('progress' + id).innerHTML = Math.floor(thousandths / 10) + "." + (thousandths % 10) + "%";
    $id('avail' + id).className = 'availableFile downloading';
  }
}

function sendFile(id) {
  var file = localFiles[id];
  var chunkSize = 16384;
  localFileCounter[id] += 1;
  var savedCounter = localFileCounter[id];

  var sliceFile = function(offset, index) {
    var reader = new window.FileReader();
    reader.onload = function(e) {
      if (localFileCounter[id] !== savedCounter) {
        return;
      }
      console.log("Sending Chunk: " + offset + " " + e.target.result.byteLength);
      connection.send({msg:'fileChunk', id:id, i:index, d:e.target.result});
      if (file.size > offset + e.target.result.byteLength) {
        window.setTimeout(sliceFile, 0, offset + chunkSize, index + 1);
      }
    };
    var slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  };
  sliceFile(0, 0);
}

function requestFile(id) {
  connection.send({msg:'getFile', id:id});
}

function textForSize(n) {
  if (n < 1024) {
    return n + "b";
  }
  n = Math.floor(n / 1024);
  if (n < 1024) {
    return n + "k";
  }
  n = Math.floor(n / 1024);
  if (n < 1024) {
    return n + "m";
  }
  n = Math.floor(n / 1024);
  return n + "g";
}

function listRemoteFile(name, id, size) {
  var divElt = $e('div');
  divElt.className = 'availableFile available';
  divElt.id = 'avail' + id;
  divElt.appendChild($txt(name + " (" + textForSize(size) + ") "));

  var getElt = $e('button');
  getElt.onclick = function () { requestFile(id); getElt.disabled = true; };
  getElt.appendChild($txt('Get'));
  divElt.appendChild(getElt);

  var progressElt = $e('span');
  progressElt.id = 'progress' + id;
  progressElt.appendChild($txt('0.0%'));
  divElt.appendChild(progressElt);

  var saveElt = $e('a');
  saveElt.id = 'download' + id;
  saveElt.appendChild($txt('Save'));
  divElt.appendChild(saveElt);

  $id('filelist').appendChild(divElt);
  $id('connected').className = 'hasfiles';
  remoteFilecount++;
  remoteFilenames[id] = name;
  remoteFilesizes[id] = size;
  remoteFileData[id] = [];
  remoteFileRcvd[id] = 0;
}

function removeRemoteFile(id) {
  $id('filelist').removeChild($id('avail' + id));
  remoteFilenames[id] = null;
  remoteFilecount--;
  if (remoteFilecount === 0) {
    $id('connected').className = '';
  }
}

function removeFileAvailable(id) {
  localFiles[id] = null;
  $id('queuefiles').removeChild($id('fileDiv' + id));
  if (connection) {
    connection.send({msg:'fileDeleted', id:id});
  }
}

function makeFileAvailable(file) {
  var fileId = '' + nextFileId;
  localFiles[fileId] = file;
  localFileCounter[fileId] = 0;
  if (connection) {
    connection.send({msg:'fileAvailable', name:file.name, id:fileId, size:file.size});
  }

  var divElt = $e('div');
  divElt.id = 'fileDiv' + fileId;
  divElt.appendChild($txt(file.name));
  var delBtn = $e('button');
  delBtn.appendChild($txt('Remove'));
  delBtn.onclick = function() { removeFileAvailable(fileId); };
  divElt.appendChild(delBtn);
  $id('queuefiles').insertBefore(divElt, $id('activeInputDiv'));

  nextFileId++;
}

function connectionClosed() {
  $id('connection').className = 'waiting';
  connectState++;
  connection = null;
  $id('filelist').innerHTML = 'Files available:';
  remoteFilecount = 0;
  remoteFilenames = {};
  remoteFilesizes = {};
  remoteFileData = {};
  remoteFileRcvd = {}
  $id('connected').className = '';
}

function peerConnected(conn) {
  conn.on('open', function() { connectionOpened(conn); });
}

function enumFiles() {
  for (var i = 1; i < nextFileId; ++i) {
    var id = '' + i;
    if (localFiles[id]) {
      connection.send({msg:'fileAvailable', name:localFiles[id].name, id:id, size:localFiles[id].size});
    }
  }
}

function connectionOpened(conn) {
  $id('connection').className = 'connected';

  connectState++;
  connection = conn;

  conn.on('data', function(data) {
    if (data.msg === 'enumFiles') {
      enumFiles();
    } else if (data.msg === 'fileAvailable') {
      listRemoteFile(data.name, data.id, data.size);
    } else if (data.msg === 'fileDeleted') {
      removeRemoteFile(data.id);
    } else if (data.msg === 'getFile') {
      sendFile(data.id);
    } else if (data.msg === 'fileChunk') {
      receivedFileChunk(data.id, data.d, data.i);
    }
  });
  conn.on('error', function(err) {
    alert('Internal Error');
    console.log('Connection error');
    console.log(err);
  });
  conn.on('close', connectionClosed);
  $id('disconnect').onclick = function() {
    conn.close();
    connectionClosed();
  };

  setTimeout(function() { conn.send({msg:'enumFiles'}); }, 200);
}

function handleFileChange() {
  var files = $id('activeInput').files;
  if (files.length > 0) {
    for (var i = 0; files[i]; ++i) {
      makeFileAvailable(files[i]);
    }
    $id('queuefiles').removeChild($id('activeInputDiv'));

    addFileDiv();
  }
};

function addFileDiv() {
  var divElt = $e('div');
  divElt.id = 'activeInputDiv';
  var inputElt = $e('input');
  inputElt.type = 'file';
  inputElt.multiple = true;
  inputElt.id = 'activeInput';
  inputElt.onchange = handleFileChange;
  divElt.appendChild(inputElt);
  $id('queuefiles').appendChild(divElt);
}

function fileDragHover(e) {
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  if (e.type === "dragover") {
    $id('overlay').className = "drophover";
  } else if (e.toElement === undefined || (e.pageX === 0 && e.pageY === 0)) {
    $id('overlay').className = "";
  }
}

function fileSelectHandler(e) {
  e.stopPropagation();
  e.preventDefault();
  $id('overlay').className = '';

  var files = e.target.files || e.dataTransfer.files;
  for (var i = 0; files[i]; i++) {
    makeFileAvailable(files[i]);
  }
}

function setupDragDrop() {
  document.documentElement.addEventListener("dragover", fileDragHover, false);
  document.documentElement.addEventListener("dragleave", fileDragHover, false);
  document.documentElement.addEventListener("drop", fileSelectHandler, false);
}

function tryConnect(key) {
  var conn = peer.connect(key.trim().replace(/-/g, ''));
  peerConnected(conn);
  $id('connection').className = 'attempting';
  connectState++;
  var savedConnectionState = connectState;
  setTimeout(function() {
    if (connectState === savedConnectionState) {
      conn.close();
      $id('connection').className = 'waiting';
      connectState++;
    }
  }, 10000);
}

function dashify(s) {
  if (s.length > 4) {
    return s.substring(0,4) + '-' + dashify(s.substring(4));
  } else {
    return s;
  }
}

peer.on('open', function() {
  var id = dashify(peer.id);
  qr.canvas({ canvas: $id('qr-code'), value: 'http://sendfiles.direct/save.html#' + id });

  $id('id').appendChild($txt(id));
  $id('connect').onclick = function() {
    var key = prompt('Computer ID:');
    if (key) {
      tryConnect(key);
    }
  };
  $id('directlink').onclick = function() {
    prompt('To copy press Ctrl+C, Enter:', 'http://sendfiles.direct/#' + id);
  };

  $id('connection').className = 'waiting';
  connectState++;

  addFileDiv();
  setupDragDrop();

  if (document.location.hash) {
    tryConnect(document.location.hash.substring(1));
  }
});

peer.on('connection', peerConnected);
