const mongoose = require("mongoose");
const DestinationSchema = new mongoose.Schema({
  dest_name: {
    type: String,
    required: true,
  },
  dest_location: {
    type: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },
  },
  dest_image: {
    type: String,
    required: false,
  },
  dest_description: {
    type: String,
    required: true,
  },
});
const Destination = new mongoose.model("Destination", DestinationSchema);
module.exports = Destination;
