require("dotenv").config();
const crypto = require("crypto");
const _ = require("lodash");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Token = require("../models/tokenModel");
const sendEmail = require("../utils/sendEmail");
const ProviderProfile = require("../models/providerProfileModel");
const TouristProfile = require("../models/touristProfileModel");
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

module.exports.signup = async (req, res) => {
  try {
    const { full_name, email, password, re_password, role } = req.body;
    if (!full_name || !email || !password || !re_password || !role) {
      return res.status(400).json({ message: "all fields are required" });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    if (password != re_password) {
      return res.status(400).json({ message: "password mismatch" });
    }
    let user = await User.findOne({ email: email });
    if (user) {
      return res.status(400).json({ message: "user already exists" });
    }
    user = new User(
      _.pick(req.body, ["full_name", "email", "password", "role"])
    );
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    const token = await jwt.sign(
      { id: user._id, role: user.role, status: user.verification_status },
      process.env.PRIVATE_SECERET_TOKEN
    );
    await user.save();
    res
      .cookie("token", token, {
        path: "/",
        httpOnly: true,
        sameSite: "none",
        secure: true,
      })
      .json({ message: "user signup successfully", body: user })
      .status(200);
  } catch (err) {
    console.log(err.message);
  }
};

module.exports.Login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "all fields are required" });
    }
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(400).json({ message: "invalid email or password" });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: "invalid email or password" });
    }
    const token = await jwt.sign(
      { id: user._id, role: user.role, status: user.verification_status },
      process.env.PRIVATE_SECERET_TOKEN
    );
    res
      .cookie("token", token, {
        path: "/",
        httpOnly: true,
        sameSite: "none",
        secure: true,
      })
      .json({ message: "loggedin successfully", body: user })
      .status(200);
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.logout = async (req, res) => {
  res.cookie("token", "", {
    path: "/",
    httpOnly: true,
    expires: new Date(0), // Setting expiration date to past
    sameSite: "none",
    secure: true,
  });
  res.status(200).json({
    message: "logged out successfully",
  });
};

module.exports.changePassword = async (req, res) => {
  try {
    const id = req.user.id;
    const { old_password, re_password, new_password } = req.body;
    if (!old_password || !re_password || !new_password) {
      res.json({ message: "all fields are required" });
    }
    if (!id) {
      return res.json({ message: "not authorized" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.json({ message: "user does not exist" });
    }
    if (new_password != re_password) {
      return res.json({ message: " password mismatch" });
    }
    const validate = await bcrypt.compare(old_password, user.password);
    if (!validate) {
      return res.json({ message: "old password incorrect" });
    }
    user.password = new_password;
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    await user.save();
    return res.json({ message: user });
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  const user = await User.findOne({ email: email });
  if (!user) {
    res.send("user doesn't exist");
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  let resetToken = crypto.randomBytes(32).toString("hex") + user._id;
  console.log(resetToken);

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Save Token to DB
  await new Token({
    userId: user._id,
    token: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * (60 * 1000), // Thirty minutes
  }).save();
  const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;

  const message = `
  <h2>Hello ${user.full_name}</h2>
  <p>Please use the url below to reset your password</p>  
  <p>This reset link is valid for only 15 minutes.</p>

  <a href=${resetUrl} clicktracking=off>${resetUrl}</a>

  <p>Regards...</p>
  <p>Tripmate Team</p>
`;
  const subject = "Password Reset Request";
  const send_to = user.email;
  console.log(send_to);
  const sent_from = process.env.EMAIL_USER;
  console.log(sent_from);

  try {
    await sendEmail(subject, message, send_to, sent_from);
    res.status(200).json({ success: true, message: "Reset Email Sent" });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

module.exports.resetPassword = async (req, res) => {
  const { password, re_password } = req.body;
  const { resetToken } = req.params;

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // fIND tOKEN in DB
  const userToken = await Token.findOne({
    token: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404).send("Invalid or Expired Token");
  }
  if (password === re_password) {
    res.status(400).send("password mismatch");
  }

  // Find user
  const user = await User.findOne({ _id: userToken.userId });
  user.password = password;
  await user.save();
  res.status(200).json({
    message: "Password Reset Successful, Please Login",
  });
};
module.exports.getLoginStatus = async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json(false);
  }
  const verified = jwt.verify(token, process.env.PRIVATE_SECERET_TOKEN);
  if (verified) {
    return res.json(true);
  }
  return res.json(false);
};
module.exports.getCounts = async (req, res) => {
  try {
    const hotelCount = await User.countDocuments({ role: "hotel manager" });
    const agentCount = await User.countDocuments({ role: "tour guide" });
    const shopCount = await User.countDocuments({ role: "shop owner" });
    const touristCount = await User.countDocuments({ role: "tourist" });
    const providersCount = await User.countDocuments({
      role: { $nin: ["admin", "tourist"] },
    });

    const bannedCount = await User.countDocuments({
      verification_status: "banned",
    });

    res.status(200).json({
      success: true,
      data: {
        hotels: hotelCount,
        agents: agentCount,
        shops: shopCount,
        tourists: touristCount,
        providers: providersCount,
        banned: bannedCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch counts",
      error: error.message,
    });
  }
};
module.exports.userInfo = async (req, res) => {
  try {
    const id = req.user.id;
    if (!id) {
      return res.json({ message: "not authorized" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.json({ message: "user does not exist" });
    }
    return res.json({ message: user });
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.verifyUser = async (req, res) => {
  try {
    const { role } = req.user;
    if (role != "admin") {
      return res.json({ message: "you are not allowed verify user" });
    }
    const id = req.body.id;
    const user = await User.findById(id);
    if (!user) {
      return res.json({ message: "user does not exist" });
    }
    user.verification_status = "verified";
    await user.save();
    return res.json(user);
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.banUser = async (req, res) => {
  try {
    const { role } = req.user;
    if (role != "admin") {
      return res.json({ message: "you are not allowed ban user" });
    }
    const id = req.body.id;
    const user = await User.findById(id);
    if (!user) {
      return res.json({ message: "user does not exist" });
    }
    user.verification_status = "banned";
    await user.save();
    return res.json(user);
  } catch (err) {
    res.json({ message: err.message });
  }
};
module.exports.getAllUsers = async (req, res) => {
  try {
    const { role } = req.user;
    if (role != "admin") {
      return res.json({ message: "you are not allowed ban user" });
    }
    const user = await User.find({ role: { $ne: "admin" } });
    if (!user) {
      return res.json({ message: "no user found" });
    }
    return res.json(user);
  } catch (err) {
    res.json({ message: err.message });
  }
};
module.exports.getSingleUser = async (req, res) => {
  try {
    const { role } = req.user;
    if (role != "admin") {
      return res.json({ message: "you are not allowed ban user" });
    }
    const id = req.query.id;
    const user = await User.findById(id);
    if (!user) {
      return res.json({ message: "no user found" });
    }
    if (user.role === "tourist") {
      const tourist = await TouristProfile.findById(id);
      return res.json({
        message: "tourist",
        body: tourist,
      });
    } else {
      const Provider = await ProviderProfile.findById(id);
      return res.json({
        message: "Provider",
        body: Provider,
      });
    }
  } catch (err) {
    res.json({ message: err.message });
  }
};
module.exports.searchHotel = async (req, res) => {
  try {
    const { key } = req.params;
    const hotel = await User.find({ role: "hotel manager" }).select("_id");
    const hotels = await ProviderProfile.find({
      company_name: { $regex: new RegExp(key, "i") },
      _id: { $in: hotel },
    });
    res.json(hotels).status(200);
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.searchAgent = async (req, res) => {
  try {
    const { key } = req.params;
    const agent = await User.find({ role: "tour guide" }).select("_id");
    const agents = await ProviderProfile.find({
      company_name: { $regex: new RegExp(key, "i") },
      _id: { $in: agent },
    });
    res.json(agents).status(200);
  } catch (err) {
    res.json({ message: err.message });
  }
};

module.exports.getSingleHotel = async (req, res) => {
  try {
    const { id } = req.params;
    const hotels = await ProviderProfile.findById(id);
    res.json(hotels).status(200);
  } catch (err) {
    res.json({ message: err.message });
  }
};

