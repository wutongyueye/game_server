"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var GameHoodleProto_1 = require("../../../protocol/GameHoodleProto");
var Log_1 = __importDefault(require("../../../../utils/Log"));
var State_1 = require("../config/State");
var StringUtil_1 = __importDefault(require("../../../../utils/StringUtil"));
var MySqlGame_1 = __importDefault(require("../../../../database/MySqlGame"));
var GameHoodleConfig_1 = __importDefault(require("../config/GameHoodleConfig"));
var Response_1 = __importDefault(require("../../../protocol/Response"));
var RoomManager_1 = __importDefault(require("../RoomManager"));
var ArrayUtil_1 = __importDefault(require("../../../../utils/ArrayUtil"));
var GameFunction = /** @class */ (function () {
    function GameFunction() {
    }
    ////////////////////////////////////////
    ///对外接口
    ////////////////////////////////////////
    //设置房间内所有玩家状态
    GameFunction.set_all_player_state = function (room, user_state) {
        var player_set = room.get_all_player();
        for (var uid in player_set) {
            var player = player_set[uid];
            if (player) {
                player.set_user_state(user_state);
            }
        }
    };
    //生成初始坐标(为了不让小球开局位置在一块)
    GameFunction.generate_start_pos = function (pos_index) {
        // let posx = StringUtil.random_int(-540 , 540);
        // let posy = StringUtil.random_int(-960 , 960);
        var posx_random = 0;
        var posy_random = 0;
        if (pos_index % 2 == 0) {
            var array_len = GameFunction._startx_left_array.length;
            posx_random = GameFunction._startx_left_array[StringUtil_1["default"].random_int(0, array_len - 1)];
            array_len = GameFunction._starty_up_array.length;
            posy_random = GameFunction._starty_up_array[StringUtil_1["default"].random_int(0, array_len - 1)];
        }
        else {
            var array_len = GameFunction._startx_right_array.length;
            posx_random = GameFunction._startx_right_array[StringUtil_1["default"].random_int(0, array_len - 1)];
            array_len = GameFunction._starty_down_array.length;
            posy_random = GameFunction._starty_down_array[StringUtil_1["default"].random_int(0, array_len - 1)];
        }
        var startx_pos = posx_random < 0 ? posx_random : 0;
        var endx_pos = posx_random > 0 ? posx_random : 0;
        var starty_pos = posy_random < 0 ? posy_random : 0;
        var endy_pos = posy_random > 0 ? posy_random : 0;
        var posx = StringUtil_1["default"].random_int(startx_pos, endx_pos);
        var posy = StringUtil_1["default"].random_int(starty_pos, endy_pos);
        return { posx: posx, posy: posy };
    };
    //清除玩家当局数据
    GameFunction.clear_all_player_cur_data = function (room) {
        var player_set = room.get_all_player();
        for (var uid in player_set) {
            var player = player_set[uid];
            if (player) {
                player.set_user_power(State_1.PlayerPower.canNotPlay);
                player.set_user_pos({ posx: 0, posy: 0 });
            }
        }
    };
    //设置玩家初始权限
    GameFunction.set_player_start_power = function (room) {
        var can_play_seatid = StringUtil_1["default"].random_int(1, room.get_player_count());
        var player_set = room.get_all_player();
        var player_array = [];
        for (var key in player_set) {
            player_array.push(player_set[key]);
        }
        var player = player_array[can_play_seatid - 1];
        if (!player) {
            Log_1["default"].error("hcc>>set_player_start_power player is null ,seatid: ", can_play_seatid);
            return false;
        }
        player.set_user_power(State_1.PlayerPower.canPlay);
        Log_1["default"].info("hcc>>set_player_start_power seatid: " + player.get_seat_id(), " ,power: " + player.get_user_power());
        return true;
    };
    //计算玩家权限
    GameFunction.set_next_player_power = function (room) {
        var player_set = room.get_all_player();
        var next_power_seatid = -1;
        for (var uid in player_set) {
            var player = player_set[uid];
            if (player) {
                var power = player.get_user_power();
                if (power == State_1.PlayerPower.canPlay) {
                    player.set_user_power(State_1.PlayerPower.canNotPlay);
                    next_power_seatid = player.get_seat_id() + 1;
                    if (next_power_seatid > room.get_player_count()) {
                        next_power_seatid = next_power_seatid % room.get_player_count();
                    }
                    Log_1["default"].info("hcc>> cur power seat: ", player.get_seat_id());
                    Log_1["default"].info("hcc>> next power seat: ", next_power_seatid);
                    break;
                }
            }
        }
        if (next_power_seatid == -1) {
            Log_1["default"].error("error: next_power_seatid is -1");
            return;
        }
        for (var uid in player_set) {
            var player = player_set[uid];
            if (player) {
                if (player.get_seat_id() == next_power_seatid) {
                    player.set_user_power(State_1.PlayerPower.canPlay);
                }
                else {
                    player.set_user_power(State_1.PlayerPower.canNotPlay);
                }
            }
        }
    };
    //计算玩家金币，设置到player，写入数据库
    //考虑不够减的情况
    GameFunction.cal_player_chip_and_write = function (room) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var _loop_1 = function (key) {
            var player = player_set[key];
            if (player) {
                var score = player.get_user_score();
                var gold_win = score * GameHoodleConfig_1["default"].KW_WIN_RATE;
                if (gold_win != 0) {
                    var player_cur_chip = player.get_uchip();
                    if (gold_win < 0) {
                        if (Math.abs(gold_win) > Math.abs(player_cur_chip)) {
                            gold_win = (-1) * player_cur_chip;
                        }
                    }
                    Log_1["default"].info(player.get_uname(), "hcc>>cal_player_chip_and_write: score: ", score, " ,gold_win: ", gold_win, " ,cur_chip: ", player.get_uchip(), " ,after add: ", (player.get_uchip() + gold_win));
                    player.set_uchip(player.get_uchip() + gold_win);
                    MySqlGame_1["default"].add_ugame_uchip(player.get_uid(), gold_win, function (status, ret) {
                        if (status == Response_1["default"].OK) {
                            Log_1["default"].info("hcc>>cal_player_chip_and_write success", player.get_uname());
                        }
                    });
                }
            }
        };
        for (var key in player_set) {
            _loop_1(key);
        }
    };
    ////////////////////////////////////////
    ///发送消息，房间相关
    ////////////////////////////////////////
    //向房间内所有人发送局内玩家信息
    GameFunction.broadcast_player_info_in_rooom = function (room, not_to_player) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var userinfo_array = [];
        try {
            for (var key in player_set) {
                var player = player_set[key];
                if (player) {
                    var userinfo = {
                        numberid: String(player.get_numberid()),
                        userinfostring: JSON.stringify(player.get_player_info())
                    };
                    userinfo_array.push(userinfo);
                }
            }
            room.broadcast_in_room(GameHoodleProto_1.Cmd.eUserInfoRes, { userinfo: userinfo_array }, not_to_player);
        }
        catch (error) {
            Log_1["default"].error(error);
        }
    };
    //向某个玩家发送局内玩家信息
    GameFunction.send_player_info = function (player) {
        if (!player) {
            return;
        }
        var room = RoomManager_1["default"].getInstance().get_room_by_uid(player.get_uid());
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        if (ArrayUtil_1["default"].GetArrayLen(player_set) <= 0) {
            return;
        }
        var userinfo_array = [];
        try {
            for (var key in player_set) {
                var player_1 = player_set[key];
                if (player_1) {
                    var userinfo = {
                        numberid: String(player_1.get_numberid()),
                        userinfostring: JSON.stringify(player_1.get_player_info())
                    };
                    userinfo_array.push(userinfo);
                }
            }
            player.send_cmd(GameHoodleProto_1.Cmd.eUserInfoRes, { userinfo: userinfo_array });
        }
        catch (error) {
            Log_1["default"].error(error);
        }
    };
    //向房间内所有人发送某玩家准备的消息
    GameFunction.send_player_state = function (room, src_player, not_to_player) {
        var body = {
            status: Response_1["default"].OK,
            seatid: Number(src_player.get_seat_id()),
            userstate: Number(src_player.get_user_state())
        };
        room.broadcast_in_room(GameHoodleProto_1.Cmd.eUserReadyRes, body, not_to_player);
    };
    //发送局数
    GameFunction.send_play_count = function (room, not_to_player) {
        var body = {
            playcount: String(room.get_play_count()),
            totalplaycount: String(room.get_conf_play_count())
        };
        room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayCountRes, body, not_to_player);
    };
    ////////////////////////////////////
    /////发送消息,游戏逻辑相关
    ////////////////////////////////////
    //发送玩家出生位置
    GameFunction.send_player_first_pos = function (room, not_player, only_player) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_pos_array = [];
        var pos_index = 0;
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var pos = GameFunction.generate_start_pos(pos_index);
                Log_1["default"].info("hcc>>send_player_first_pos: ", pos);
                player.set_user_pos(pos);
                var player_pos = {
                    seatid: Number(player.get_seat_id()),
                    posx: String(pos.posx),
                    posy: String(pos.posy)
                };
                player_pos_array.push(player_pos);
                pos_index++;
            }
        }
        Log_1["default"].info("hcc>>send_player_first_pos array: ", player_pos_array);
        if (only_player) {
            only_player.send_cmd(GameHoodleProto_1.Cmd.ePlayerFirstBallPosRes, { positions: player_pos_array });
        }
        else {
            room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerFirstBallPosRes, { positions: player_pos_array }, not_player);
        }
    };
    //发送玩家权限
    GameFunction.send_player_power = function (room, not_player, only_player) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_power_array = [];
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var player_pos = {
                    seatid: Number(player.get_seat_id()),
                    power: Number(player.get_user_power())
                };
                player_power_array.push(player_pos);
            }
        }
        if (only_player) {
            only_player.send_cmd(GameHoodleProto_1.Cmd.ePlayerPowerRes, { status: Response_1["default"].OK, powers: player_power_array });
        }
        else {
            room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerPowerRes, { status: Response_1["default"].OK, powers: player_power_array }, not_player);
        }
    };
    //发送玩家射击 ,服务只做转发
    GameFunction.send_player_shoot = function (room, shoot_info, not_player) {
        if (!room || !shoot_info || !not_player) {
            return;
        }
        var body = {
            status: Response_1["default"].OK,
            seatid: Number(shoot_info.seatid),
            posx: String(shoot_info.posx),
            posy: String(shoot_info.posy),
            shootpower: Number(shoot_info.shootpower)
        };
        room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerShootRes, body, not_player);
    };
    //发送玩家位置，球停下后
    GameFunction.send_player_ball_pos = function (room, not_player, only_player) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_pos_array = [];
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var player_pos = {
                    seatid: Number(player.get_seat_id()),
                    posx: String(player.get_user_pos().posx),
                    posy: String(player.get_user_pos().posy)
                };
                player_pos_array.push(player_pos);
            }
        }
        if (only_player) {
            only_player.send_cmd(GameHoodleProto_1.Cmd.ePlayerBallPosRes, { status: Response_1["default"].OK, positions: player_pos_array });
        }
        else {
            room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerBallPosRes, { status: Response_1["default"].OK, positions: player_pos_array }, not_player);
        }
    };
    //发送玩家射中 ，只做转发
    GameFunction.send_player_is_shooted = function (room, shoot_info) {
        if (!room || !shoot_info) {
            return;
        }
        var body = {
            status: Response_1["default"].OK,
            srcseatid: Number(shoot_info.srcseatid),
            desseatid: Number(shoot_info.desseatid)
        };
        room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerIsShootedRes, body);
    };
    //发送小结算
    GameFunction.send_game_result = function (room) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_score_array = [];
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var one_score = {
                    seatid: Number(player.get_seat_id()),
                    score: String(player.get_user_score())
                };
                player_score_array.push(one_score);
            }
        }
        room.broadcast_in_room(GameHoodleProto_1.Cmd.eGameResultRes, { scores: player_score_array });
    };
    //发送大结算
    GameFunction.send_game_total_result = function (room) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_score_array = [];
        var player_golds_array = [];
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var one_score = {
                    seatid: Number(player.get_seat_id()),
                    score: String(player.get_user_score())
                };
                //金币不够情况
                var score = player.get_user_score();
                var gold_win = score * GameHoodleConfig_1["default"].KW_WIN_RATE;
                var one_gold = {
                    seatid: Number(player.get_seat_id()),
                    gold: String(gold_win)
                };
                player_score_array.push(one_score);
                player_golds_array.push(one_gold);
            }
        }
        var body = {
            scores: player_score_array,
            golds: player_golds_array
        };
        room.broadcast_in_room(GameHoodleProto_1.Cmd.eTotalGameResultRes, body);
    };
    //发送玩家得分
    GameFunction.send_player_score = function (room, not_player, only_player) {
        if (!room) {
            return;
        }
        var player_set = room.get_all_player();
        var player_score_array = [];
        for (var key in player_set) {
            var player = player_set[key];
            if (player) {
                var one_score = {
                    seatid: Number(player.get_seat_id()),
                    score: String(player.get_user_score())
                };
                player_score_array.push(one_score);
            }
        }
        if (only_player) {
            only_player.send_cmd(GameHoodleProto_1.Cmd.ePlayerScoreRes, { scores: player_score_array });
        }
        else {
            room.broadcast_in_room(GameHoodleProto_1.Cmd.ePlayerScoreRes, { scores: player_score_array }, not_player);
        }
    };
    GameFunction._startx_left_array = [-480, -400, -300, -200, -100];
    GameFunction._startx_right_array = [480, 400, 300, 200, 100];
    GameFunction._starty_up_array = [900, 700, 500, 300, 100];
    GameFunction._starty_down_array = [-900, -700, -500, -300, -100];
    return GameFunction;
}());
exports["default"] = GameFunction;
//# sourceMappingURL=GameFunction.js.map