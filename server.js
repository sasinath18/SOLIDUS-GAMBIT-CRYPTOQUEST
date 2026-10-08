/* =========================================================
   MEDARZT 26 — SOLIDUS GAMBIT
   NODE + WEBSOCKET SERVER
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = 3000;
const HOST_PASSWORD = "admin123";

const ROOT = __dirname;

/* =========================================================
   STATE
   ========================================================= */

const state = {
    round: 0,
    status: "idle",
    content: "",
    questionNumber: 1,

    // Round 1 maximum bid
    maxBid: 15,

    winnerId: null,
    winnerName: null,
    winnerBid: 0,

    image: "",
    images: [],

    duration: 0,
    startedAt: 0,
    endsAt: 0,

    round1Ended: false,
    round1Summary: [],

    // Round 2
    qualifiedTeamIds: [],
    round2QualifiedCount: 0,
    round2ImageNumber: 0,
    round2TotalImages: 6,

    // Bid tracking
    bidId: 0,
    bidSequence: 0,

    // Final winner
    finalWinnerId: null,
    finalWinnerName: null,
    finalWinnerConfirmed: false
};

const teams = {};

let timer = null;

/* =========================================================
   HELPERS
   ========================================================= */

function send(ws, data) {
    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (
            client.readyState === WebSocket.OPEN
        ) {
            client.send(message);
        }
    });
}

function broadcastState() {
    broadcast({
        type: "state",

        state: {
            ...state
        },

        teams: {
            ...teams
        }
    });
}

function validHost(ws) {
    return ws.role === "host";
}

function getTeam(ws) {
    return ws.teamId
        ? teams[ws.teamId]
        : null;
}

/* =========================================================
   HIGHEST BIDDER
   Highest amount wins.
   Equal highest bid -> earliest submitted bid wins.
   ========================================================= */

function highestBidTeam() {
    return Object.values(teams)
        .filter(team =>
            Number(team.currentBid || 0) > 0 &&
            (
                state.round !== 2 ||
                team.qualified
            )
        )
        .sort((a, b) => {
            const bidDifference =
                Number(b.currentBid || 0) -
                Number(a.currentBid || 0);

            if (bidDifference !== 0) {
                return bidDifference;
            }

            return (
                Number(a.currentBidOrder || 0) -
                Number(b.currentBidOrder || 0)
            );
        })[0] || null;
}

/* =========================================================
   ROUND 2 FINAL WINNER

   1st priority = most images won
   2nd priority = highest remaining points
   ========================================================= */

function calculateRound2Winner() {
    return Object.values(teams)
        .filter(team => team.qualified)
        .sort((a, b) =>
            Number(b.itemsWon || 0) -
            Number(a.itemsWon || 0) ||

            Number(b.points || 0) -
            Number(a.points || 0) ||

            String(a.name).localeCompare(
                String(b.name)
            )
        )[0] || null;
}

function qualifiedTeams() {
    return Object.values(teams)
        .filter(team => team.qualified);
}

/* =========================================================
   TEAM CREATION
   ========================================================= */

function createTeam(name) {
    const id =
        "team_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 8);

    teams[id] = {
        id,
        name,

        // Initial points
        points: 100,

        // Current question bid
        currentBid: 0,
        currentBidTime: 0,
        currentBidOrder: 0,
        currentEvaluation: "pending",

        // Round 2 qualification
        qualified: false,

        connected: true,

        // Final statistics
        itemsWon: 0,

        // Total answer counters
        correctAnswers: 0,
        wrongAnswers: 0,

        // Round-wise counters
        round1CorrectAnswers: 0,
        round1WrongAnswers: 0,
        round2CorrectAnswers: 0,
        round2WrongAnswers: 0,

        answerHistory: []
    };

    return teams[id];
}

/* =========================================================
   BID RESET
   ========================================================= */

function clearBids() {
    Object.values(teams).forEach(team => {
        team.currentBid = 0;
        team.currentBidTime = 0;
        team.currentBidOrder = 0;
        team.currentEvaluation = "pending";
    });

    state.bidSequence = 0;
}

/* =========================================================
   TIMER
   ========================================================= */

function stopTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

function startTimer(seconds) {
    stopTimer();

    const duration = Math.max(
        1,
        Number(seconds) || 30
    );

    state.duration = duration;
    state.startedAt = Date.now();
    state.endsAt =
        Date.now() +
        duration * 1000;

    timer = setTimeout(() => {
        if (state.status === "bidding") {
            state.status = "evaluating";
            state.endsAt = 0;

            broadcastState();
        }
    }, duration * 1000);
}

/* =========================================================
   HTTP SERVER
   ========================================================= */

const server = http.createServer(
    (req, res) => {
        let filePath =
            req.url === "/"
                ? path.join(
                    ROOT,
                    "index.html"
                )
                : path.join(
                    ROOT,
                    req.url
                );

        filePath = path.normalize(filePath);

        if (
            !filePath.startsWith(ROOT)
        ) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        fs.readFile(
            filePath,
            (error, data) => {
                if (error) {
                    res.writeHead(404);
                    res.end("Not Found");
                    return;
                }

                const ext =
                    path.extname(filePath);

                const types = {
                    ".html": "text/html",
                    ".js": "text/javascript",
                    ".css": "text/css",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".svg": "image/svg+xml"
                };

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            types[ext] ||
                            "application/octet-stream"
                    }
                );

                res.end(data);
            }
        );
    }
);

/* =========================================================
   WEBSOCKET
   ========================================================= */

const wss =
    new WebSocket.Server({
        server,
        maxPayload:
            50 * 1024 * 1024
    });

wss.on(
    "connection",
    ws => {
        ws.role = null;
        ws.teamId = null;

        // Send current state immediately
        send(ws, {
            type: "state",

            state: {
                ...state
            },

            teams: {
                ...teams
            }
        });

        ws.on(
            "message",
            raw => {
                let data;

                try {
                    data = JSON.parse(
                        raw.toString()
                    );
                } catch {
                    send(ws, {
                        type: "error",
                        message:
                            "Invalid request."
                    });

                    return;
                }

                handleMessage(
                    ws,
                    data
                );
            }
        );

        ws.on(
            "close",
            () => {
                if (
                    ws.teamId &&
                    teams[ws.teamId]
                ) {
                    teams[
                        ws.teamId
                    ].connected = false;

                    broadcastState();
                }
            }
        );
    }
);

/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

function handleMessage(ws, d) {
    switch (d.type) {

        /* ================================================
           HOST LOGIN
           ================================================ */

        case "host-login":

            if (
                d.password !==
                HOST_PASSWORD
            ) {
                return send(
                    ws,
                    {
                        type: "error",
                        message:
                            "Incorrect host password."
                    }
                );
            }

            ws.role = "host";

            send(
                ws,
                {
                    type:
                        "host-login-success"
                }
            );

            broadcastState();

            break;

        /* ================================================
           HOST RECONNECT
           ================================================ */

        case "host-reconnect":

            ws.role = "host";

            send(
                ws,
                {
                    type:
                        "host-login-success"
                }
            );

            broadcastState();

            break;

        /* ================================================
           TEAM LOGIN
           ================================================ */

        case "join-team": {

            const name =
                String(
                    d.teamName || ""
                )
                    .trim()
                    .slice(
                        0,
                        40
                    );

            if (!name) {
                return send(
                    ws,
                    {
                        type:
                            "team-error",

                        message:
                            "Enter team name."
                    }
                );
            }

            const team =
                createTeam(name);

            ws.role =
                "participant";

            ws.teamId =
                team.id;

            send(
                ws,
                {
                    type:
                        "team-created",

                    teamId:
                        team.id
                }
            );

            send(
                ws,
                {
                    type:
                        "participant-login-success",

                    teamId:
                        team.id
                }
            );

            broadcastState();

            break;
        }

        /* ================================================
           PARTICIPANT RECONNECT
           ================================================ */

        case "reconnect": {

            const team =
                teams[d.teamId];

            if (!team) {
                return send(
                    ws,
                    {
                        type:
                            "error",

                        message:
                            "Team not found."
                    }
                );
            }

            ws.role =
                "participant";

            ws.teamId =
                d.teamId;

            team.connected =
                true;

            send(
                ws,
                {
                    type:
                        "participant-login-success",

                    teamId:
                        d.teamId
                }
            );

            broadcastState();

            break;
        }
                /* ================================================
           ROUND 1 — START
           ================================================ */

        case "start-round1": {

            if (!validHost(ws)) {
                return;
            }

            if (
                state.round === 2 ||
                state.round === 3
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Round 1 has already ended."
                });
            }

            state.round = 1;

            state.status = "bidding";

            state.questionNumber =
                Number(d.questionNumber) || 1;

            state.content =
                String(d.question || "").trim();

            if (!state.content) {
                state.status = "idle";

                return send(ws, {
                    type: "error",
                    message:
                        "Enter a question first."
                });
            }

            // Round 1 maximum bid = 15
            state.maxBid = 15;

            state.winnerId = null;
            state.winnerName = null;
            state.winnerBid = 0;

            state.image = "";
            state.images = [];

            state.round1Ended = false;

            state.bidId =
                Number(state.bidId || 0) + 1;

            clearBids();

            startTimer(
                Number(d.duration) || 30
            );

            broadcastState();

            break;
        }


        /* ================================================
           PLACE BID
           ================================================ */

        case "place-bid": {

            if (ws.role !== "participant") {
                return send(ws, {
                    type: "error",
                    message:
                        "Only participants can place bids."
                });
            }

            if (state.status !== "bidding") {
                return send(ws, {
                    type: "error",
                    message:
                        "Bidding is closed."
                });
            }

            // Prevent bids after the timer has expired
            if (
                state.endsAt > 0 &&
                Date.now() >= state.endsAt
            ) {
                stopTimer();

                state.status = "evaluating";
                state.endsAt = 0;

                broadcastState();

                return send(ws, {
                    type: "error",
                    message:
                        "Bidding time has ended."
                });
            }

            const team = getTeam(ws);

            if (!team) {
                return send(ws, {
                    type: "error",
                    message:
                        "Team not found."
                });
            }

            // Only qualified teams can bid in Round 2
            if (
                state.round === 2 &&
                !team.qualified
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "You are not qualified for Round 2."
                });
            }

            const bid = Number(d.bid);

            if (
                !Number.isInteger(bid) ||
                bid < 1
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Invalid bid."
                });
            }

            const availablePoints =
                Math.max(
                    0,
                    Number(team.points) || 0
                );

            if (bid > availablePoints) {
                return send(ws, {
                    type: "error",
                    message:
                        `Maximum bid is ${availablePoints} points.`
                });
            }

            /*
             * Round 1 maximum bid = 15
             *
             * Round 2:
             * No 15-point restriction.
             * Team can bid any positive integer
             * within available points.
             */
            if (
                state.round === 1 &&
                bid > Number(state.maxBid || 15)
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        `Round 1 maximum bid is ${Number(
                            state.maxBid || 15
                        )}.`
                });
            }

            // One bid per team per question
            if (Number(team.currentBid) > 0) {
                return send(ws, {
                    type: "error",
                    message:
                        "You already placed your bid."
                });
            }

            const bidTime = Date.now();

            state.bidSequence++;

            team.currentBid = bid;

            team.currentBidTime =
                bidTime;

            team.currentBidOrder =
                state.bidSequence;

            team.currentEvaluation =
                "pending";


            /* ============================================
               ROUND 2 IMPORTANT RULE

               Bid is deducted immediately.

               Example:
               Current points = 200
               Bid = 50
               Remaining points = 150

               Later CORRECT:
               +1 correct
               +1 image won

               Later WRONG:
               +1 wrong
               +0 image won

               There is NO second bid deduction.
               ============================================ */

            if (state.round === 2) {
                team.points =
                    Math.max(
                        0,
                        Number(team.points) - bid
                    );
            }

            broadcastState();

            break;
        }


        /* ================================================
           CLOSE BIDDING
           ================================================ */

        case "close-bidding": {

            if (!validHost(ws)) {
                return;
            }

            if (state.status !== "bidding") {
                return;
            }

            stopTimer();

            state.status = "evaluating";

            state.endsAt = 0;

            broadcastState();

            break;
        }


        /* ================================================
           ROUND 1 — MANUAL EVALUATION

           Only the highest bidder can be evaluated.
           Highest bid wins.
           If tied, earliest bid wins.
           ================================================ */

        case "evaluate-round1": {

            if (!validHost(ws)) {
                return;
            }

            if (
                state.round !== 1 ||
                state.status !== "evaluating"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Round 1 is not in evaluation stage."
                });
            }

            const team =
                teams[d.teamId];

            if (!team) {
                return send(ws, {
                    type: "error",
                    message:
                        "Invalid team."
                });
            }

            if (team.currentBid <= 0) {
                return send(ws, {
                    type: "error",
                    message:
                        "That team did not place a bid."
                });
            }

            if (
                team.currentEvaluation !==
                "pending"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "That bid has already been evaluated."
                });
            }

            const highest =
                highestBidTeam();

            if (
                !highest ||
                highest.id !== team.id
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        highest
                            ? `Only the highest bidder can answer first: ${highest.name} (${highest.currentBid}).`
                            : "No valid bid is available."
                });
            }

            const bid =
                Number(team.currentBid);

            const correct =
                Boolean(d.correct);

            team.currentEvaluation =
                correct
                    ? "correct"
                    : "wrong";


            /* ============================================
               CORRECT

               Round 1:
               + bid amount
               + 5 bonus points
               ============================================ */

            if (correct) {

                team.points +=
                    bid + 5;

                team.correctAnswers++;

                team.round1CorrectAnswers++;

            } else {

                /*
                 * WRONG:
                 * Deduct only this bidder's bid.
                 *
                 * No other team loses points.
                 */
                team.points =
                    Math.max(
                        0,
                        team.points - bid
                    );

                team.wrongAnswers++;

                team.round1WrongAnswers++;
            }


            /* ============================================
               SAVE ANSWER HISTORY
               ============================================ */

            team.answerHistory.push({

                round: 1,

                questionNumber:
                    state.questionNumber,

                question:
                    state.content,

                bid: bid,

                result:
                    correct
                        ? "correct"
                        : "wrong",

                pointsChange:
                    correct
                        ? bid + 5
                        : -bid,

                pointsAfter:
                    team.points,

                bidTime:
                    team.currentBidTime,

                bidOrder:
                    team.currentBidOrder,

                time:
                    Date.now()
            });


            state.winnerId =
                team.id;

            state.winnerName =
                team.name;

            state.winnerBid =
                bid;

            broadcastState();

            break;
        }


        /* ================================================
           END ROUND 1

           Host manually decides when Round 1 ends.
           ================================================ */

        case "end-round1": {

            if (!validHost(ws)) {
                return;
            }

            if (state.round !== 1) {
                return send(ws, {
                    type: "error",
                    message:
                        "Round 1 is not active."
                });
            }

            stopTimer();

            state.status =
                "round1-ended";

            state.endsAt = 0;

            state.round1Ended = true;


            /* ============================================
               COMPLETE ROUND 1 SUMMARY

               Every team is included.
               ============================================ */

            state.round1Summary =
                Object.values(teams)
                    .map(team => ({
                        id:
                            team.id,

                        name:
                            team.name,

                        points:
                            team.points,

                        correctAnswers:
                            team.correctAnswers,

                        wrongAnswers:
                            team.wrongAnswers,

                        itemsWon:
                            team.itemsWon,

                        answerHistory:
                            team.answerHistory
                    }))
                    .sort(
                        (a, b) =>
                            Number(b.points) -
                            Number(a.points)
                    );


            broadcastState();

            break;
        }


        /* ================================================
           ROUND 2 QUALIFICATION

           Host manually checks/selects any teams.

           No TOP-N.
           No qualification count input.
           No bonus input from client.

           Every selected team gets exactly +100.
           ================================================ */

        case "qualify-round2": {

            if (!validHost(ws)) {
                return;
            }

            if (
                !state.round1Ended ||
                state.round !== 1
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "End Round 1 before selecting Round 2 teams."
                });
            }

            const ids =
                Array.isArray(
                    d.selectedTeamIds
                )
                    ? [
                        ...new Set(
                            d.selectedTeamIds
                        )
                    ].filter(
                        id => teams[id]
                    )
                    : [];

            if (!ids.length) {
                return send(ws, {
                    type: "error",
                    message:
                        "Select at least one team."
                });
            }

            /*
             * IMPORTANT:
             * Client cannot decide the bonus.
             * Server always adds exactly 100.
             */
            const ROUND2_BONUS = 100;


            /* ============================================
               RESET QUALIFICATION STATUS
               ============================================ */

            Object.values(teams)
                .forEach(team => {
                    team.qualified = false;
                });


            /* ============================================
               MARK SELECTED TEAMS
               +100 FOR EACH SELECTED TEAM
               ============================================ */

            ids.forEach(id => {

                teams[id].qualified = true;

                teams[id].points +=
                    ROUND2_BONUS;
            });


            /* ============================================
               MOVE GAME TO ROUND 2
               ============================================ */

            state.qualifiedTeamIds =
                ids;

            state.round2QualifiedCount =
                ids.length;

            state.round = 2;

            state.status = "idle";

            state.content = "";

            state.image = "";

            state.images = [];

            state.winnerId = null;

            state.winnerName = null;

            state.winnerBid = 0;

            state.round2ImageNumber = 0;

            state.round2TotalImages = 6;

            state.finalWinnerId = null;

            state.finalWinnerName = null;

            state.finalWinnerConfirmed = false;

            state.bidId =
                Number(state.bidId || 0) + 1;

            clearBids();

            broadcastState();

            break;
        }
                /* ================================================
           ROUND 2 — START IMAGE
           
           Host:
           - chooses total images only for first image
           - uploads one image
           - starts bidding
           
           Allowed total:
           6 / 7 / 8
           ================================================ */

        case "start-round2": {

            if (!validHost(ws)) {
                return;
            }

            if (
                state.round !== 2 ||
                state.status !== "idle"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Finish the current Round 2 question first."
                });
            }

            if (
                !Array.isArray(
                    state.qualifiedTeamIds
                ) ||
                state.qualifiedTeamIds.length === 0
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Select Round 2 teams first."
                });
            }

            const currentNumber =
                Number(
                    state.round2ImageNumber || 0
                );

            let totalImages =
                Number(
                    state.round2TotalImages || 0
                );


            /* ============================================
               FIRST ROUND 2 IMAGE
               Host chooses 6 / 7 / 8
               ============================================ */

            if (currentNumber === 0) {

                const requestedTotal =
                    Number(
                        d.totalImages
                    );

                if (
                    ![
                        6,
                        7,
                        8
                    ].includes(
                        requestedTotal
                    )
                ) {
                    return send(ws, {
                        type: "error",
                        message:
                            "Round 2 must contain 6, 7, or 8 images."
                    });
                }

                totalImages =
                    requestedTotal;

                state.round2TotalImages =
                    requestedTotal;
            }


            if (!totalImages) {

                totalImages = 6;

                state.round2TotalImages = 6;
            }


            /* ============================================
               DON'T EXCEED SELECTED IMAGE COUNT
               ============================================ */

            if (
                currentNumber >= totalImages
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "All Round 2 images are complete."
                });
            }


            /* ============================================
               IMAGE DATA
               ============================================ */

            const image =
                String(
                    d.image || ""
                );

            if (
                !image.startsWith(
                    "data:image/"
                )
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Upload one valid image."
                });
            }


            /* ============================================
               SET CURRENT IMAGE
               ============================================ */

            state.image = image;

            state.images = [
                image
            ];

            state.round2ImageNumber =
                currentNumber + 1;

            state.content =
                `Medical equipment image ${
                    currentNumber + 1
                } of ${totalImages}`;


            /* ============================================
               RESET CURRENT QUESTION
               ============================================ */

            state.winnerId = null;
            state.winnerName = null;
            state.winnerBid = 0;

            state.bidId =
                Number(
                    state.bidId || 0
                ) + 1;

            clearBids();

            state.status =
                "bidding";


            /* ============================================
               START QUESTION TIMER
               ============================================ */

            startTimer(
                Number(
                    d.duration
                ) || 30
            );

            broadcastState();

            break;
        }


        /* ================================================
           ROUND 2 — EVALUATE

           ONLY HIGHEST BIDDER CAN BE EVALUATED

           TIE RULE:
           Same highest bid -> earliest bid order wins.

           CORRECT:
           - +1 correct
           - +1 image won
           - NO extra point change

           WRONG:
           - +1 wrong
           - +0 image won
           - NO extra point change

           IMPORTANT:
           Round 2 bid was ALREADY deducted
           when the bid was submitted.
           ================================================ */

        case "evaluate-round2": {

            if (!validHost(ws)) {
                return;
            }

            if (
                state.round !== 2 ||
                state.status !== "evaluating"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Round 2 must be in evaluation stage."
                });
            }

            const team =
                teams[d.teamId];

            if (
                !team ||
                !team.qualified
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Invalid Round 2 team."
                });
            }

            if (
                Number(team.currentBid) <= 0
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "That team did not place a bid."
                });
            }

            if (
                team.currentEvaluation !==
                "pending"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "That team has already been evaluated."
                });
            }


            /* ============================================
               ONLY HIGHEST BIDDER CAN ANSWER
               ============================================ */

            const highest =
                highestBidTeam();

            if (
                !highest ||
                highest.id !== team.id
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        highest
                            ? `Only the highest bidder can answer first: ${highest.name} (${highest.currentBid}).`
                            : "No valid bid is available."
                });
            }


            const correct =
                Boolean(d.correct);

            const bid =
                Number(
                    team.currentBid
                );


            /* ============================================
               CORRECT
               ============================================ */

            if (correct) {

                team.itemsWon += 1;

                team.correctAnswers += 1;

                team.round2CorrectAnswers += 1;

                team.currentEvaluation =
                    "correct";

                state.winnerId =
                    team.id;

                state.winnerName =
                    team.name;

                state.winnerBid =
                    bid;

            }

            /* ============================================
               WRONG
               ============================================ */

            else {

                team.wrongAnswers += 1;

                team.round2WrongAnswers += 1;

                team.currentEvaluation =
                    "wrong";

                state.winnerId = null;

                state.winnerName = null;

                state.winnerBid = 0;
            }


            /* ============================================
               ANSWER HISTORY
               ============================================ */

            team.answerHistory.push({

                round: 2,

                imageNumber:
                    state.round2ImageNumber,

                bid: bid,

                result:
                    correct
                        ? "correct"
                        : "wrong",

                /*
                 * Bid was already deducted at
                 * submission time.
                 */
                pointsChange: 0,

                pointsAfter:
                    team.points,

                bidTime:
                    team.currentBidTime,

                bidOrder:
                    team.currentBidOrder,

                time:
                    Date.now()
            });


            broadcastState();

            break;
        }


        /* ================================================
           NEXT ROUND 2 IMAGE

           Host can click NEXT only after:
           1. bidding closed
           2. highest bidder evaluated

           This does NOT automatically upload the next
           image.

           Host must upload the next image manually and
           then press START.
           ================================================ */

        case "next-round2": {

            if (!validHost(ws)) {
                return;
            }

            if (
                state.round !== 2 ||
                state.status !== "evaluating"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Evaluate the current answer before moving to the next image."
                });
            }


            /* ============================================
               MAKE SURE HIGHEST BIDDER WAS EVALUATED
               ============================================ */

            const highest =
                highestBidTeam();

            if (
                highest &&
                highest.currentEvaluation ===
                    "pending"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        `Evaluate ${highest.name}'s answer first.`
                });
            }


            const totalImages =
                Number(
                    state.round2TotalImages || 6
                );

            const currentNumber =
                Number(
                    state.round2ImageNumber || 0
                );


            /* ============================================
               LAST IMAGE
               ============================================ */

            if (
                currentNumber >=
                totalImages
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "All Round 2 images are complete. End Round 2."
                });
            }


            /* ============================================
               PREPARE NEXT IMAGE
               ============================================ */

            state.status = "idle";

            state.endsAt = 0;

            state.image = "";

            state.images = [];

            state.content =
                `Ready for image ${
                    currentNumber + 1
                } of ${totalImages}`;

            state.winnerId = null;

            state.winnerName = null;

            state.winnerBid = 0;

            state.bidId =
                Number(
                    state.bidId || 0
                ) + 1;

            clearBids();

            broadcastState();

            break;
        }


        /* ================================================
           END ROUND 2

           AUTOMATIC WINNER

           PRIMARY:
               Most images won

           TIE BREAK:
               Highest remaining points

           NO MANUAL WINNER SELECTION
           ================================================ */

        case "end-round2": {

            if (!validHost(ws)) {
                return;
            }

            if (state.round !== 2) {
                return send(ws, {
                    type: "error",
                    message:
                        "Round 2 is not active."
                });
            }


            /* ============================================
               CANNOT END WHILE BIDDING
               ============================================ */

            if (
                state.status === "bidding"
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        "Close bidding before ending Round 2."
                });
            }


            const totalImages =
                Number(
                    state.round2TotalImages || 6
                );

            const currentNumber =
                Number(
                    state.round2ImageNumber || 0
                );


            /* ============================================
               ALL IMAGES MUST BE COMPLETED
               ============================================ */

            if (
                currentNumber <
                totalImages
            ) {
                return send(ws, {
                    type: "error",
                    message:
                        `Complete all ${totalImages} Round 2 images before ending the round.`
                });
            }


            /* ============================================
               IF CURRENT IMAGE IS STILL UNDER EVALUATION,
               HIGHEST BIDDER MUST BE EVALUATED FIRST
               ============================================ */

            if (
                state.status === "evaluating"
            ) {

                const highest =
                    highestBidTeam();

                if (
                    highest &&
                    highest.currentEvaluation ===
                        "pending"
                ) {
                    return send(ws, {
                        type: "error",
                        message:
                            `Evaluate ${highest.name}'s answer first.`
                    });
                }
            }


            stopTimer();


            /* ============================================
               CALCULATE WINNER AUTOMATICALLY
               ============================================ */

            const finalWinner =
                calculateRound2Winner();


            state.status = "final";

            state.round = 3;

            state.endsAt = 0;

            state.image = "";

            state.images = [];

            clearBids();


            /* ============================================
               SAVE FINAL WINNER
               ============================================ */

            state.finalWinnerId =
                finalWinner
                    ? finalWinner.id
                    : null;

            state.finalWinnerName =
                finalWinner
                    ? finalWinner.name
                    : null;

            state.finalWinnerConfirmed =
                Boolean(
                    finalWinner
                );


            /* ============================================
               NOTIFY CLIENTS
               ============================================ */

            if (finalWinner) {

                broadcast({
                    type:
                        "final-winner-selected",

                    teamId:
                        finalWinner.id
                });
            }

            broadcastState();

            break;
        }


        /* ================================================
           MANUAL FINAL WINNER
           
           DISABLED

           Winner is automatically calculated.
           ================================================ */

        case "select-final-winner": {

            if (!validHost(ws)) {
                return;
            }

            return send(ws, {
                type: "error",
                message:
                    "Round 2 winner is calculated automatically: most images won, then highest remaining points."
            });
        }
                /* ================================================
           RESET GAME
           ================================================ */

        case "reset-game": {

            if (!validHost(ws)) {
                return;
            }

            stopTimer();


            /* ============================================
               REMOVE ALL TEAMS
               ============================================ */

            Object.keys(teams).forEach(
                id => delete teams[id]
            );


            /* ============================================
               RESET GAME STATE
               ============================================ */

            state.round = 0;

            state.status = "idle";

            state.content = "";

            state.questionNumber = 1;

            state.maxBid = 15;

            state.winnerId = null;

            state.winnerName = null;

            state.winnerBid = 0;

            state.image = "";

            state.images = [];

            state.duration = 0;

            state.startedAt = 0;

            state.endsAt = 0;

            state.round1Ended = false;

            state.round1Summary = [];

            state.qualifiedTeamIds = [];

            state.round2QualifiedCount = 0;

            state.round2ImageNumber = 0;

            state.round2TotalImages = 6;

            state.bidId = 0;

            state.bidSequence = 0;

            state.finalWinnerId = null;

            state.finalWinnerName = null;

            state.finalWinnerConfirmed = false;


            /* ============================================
               TELL ALL CLIENTS GAME WAS RESET
               ============================================ */

            broadcast({
                type: "reset"
            });

            broadcastState();

            break;
        }


        /* ================================================
           UNKNOWN COMMAND
           ================================================ */

        default: {

            send(ws, {
                type: "error",
                message:
                    "Unknown command."
            });

            break;
        }
    }
}


/* =========================================================
   START SERVER
   ========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "MEDARZT 26 — SOLIDUS GAMBIT"
        );

        console.log(
            "Multiplayer Server Started"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            `Host Password: ${HOST_PASSWORD}`
        );

        console.log(
            "========================================"
        );
    }
);