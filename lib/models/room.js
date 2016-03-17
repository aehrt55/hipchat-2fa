var mongoose = require('mongoose');

var RoomSchema = mongoose.Schema({
	roomId: String,
	groupId: String,
	name: String,
	owner: String
});

var Room = mongoose.model('Room', RoomSchema);
Room.parse = function(hipchat) {
  return function(req, res, next) {
    Room.findOne({
      roomId: req.clientInfo.roomId
    }, function(err, room) {
      if (err === null && room === null) {
        hipchat.getRoom(req.clientInfo, req.identity.roomId)
        .then(function(data) {
          var room = new Room({
            roomId: req.identity.roomId,
            groupId: req.identity.groupId,
            name: data.body.name,
            owner: data.body.owner.id
          });
          room.save();
          req.room = room;
          next();
        });
      } else {
        req.room = room;
        next();
      }
    });
  }
};

module.exports = Room;
