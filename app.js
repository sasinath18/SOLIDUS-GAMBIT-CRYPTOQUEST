/* MEDARZT'26 — SOLIDUS GAMBIT
   Multiplayer frontend — Node + WebSocket
*/

const HOST_PASSWORD = "admin123";

const WS_PORT = 3000;

const WS_URL =
  `ws://${location.hostname || "127.0.0.1"}:${WS_PORT}`;

let socket = null;

let role = null;

let teamId =
  localStorage.getItem("medarztTeamId") || null;

let teams = {};

let gameState = {

  round: 0,

  status: "idle",

  content: "",

  questionNumber: 1,

  maxBid: 15,

  winnerId: null,

  winnerName: null,

  winnerBid: 0,

  image: "",

  images: [],

  bidId: 0,

  duration: 0,

  startedAt: 0,

  endsAt: 0,

  round1Ended: false,

  round1Summary: [],

  qualifiedTeamIds: [],

  round2QualifiedCount: 0,

  round2ImageNumber: 0,

  round2TotalImages: 6,

  finalWinnerId: null,

  finalWinnerName: null,

  finalWinnerConfirmed: false

};

let timerInterval = null;

let selectedRound2Image = null;

let selectedFinalWinnerId = null;


/* =========================================================
   COMMON HELPERS
   ========================================================= */

const $ = id =>
  document.getElementById(id);

const show = el =>
  el &&
  el.classList.remove("hidden");

const hide = el =>
  el &&
  el.classList.add("hidden");

const setText = (
  id,
  value
) => {

  const el = $(id);

  if (el) {

    el.textContent =
      value ?? "";

  }

};

const setHTML = (
  id,
  value
) => {

  const el = $(id);

  if (el) {

    el.innerHTML =
      value ?? "";

  }

};

const money = value =>
  Number(value || 0);

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );


/* =========================================================
   HOST TIMER
   FORMAT: MM:SS:MMM
   ========================================================= */

const fmtTime = ms => {

  ms =
    Math.max(
      0,
      Math.floor(
        Number(ms) || 0
      )
    );

  const minutes =
    Math.floor(
      ms / 60000
    );

  const seconds =
    Math.floor(
      (ms % 60000) / 1000
    );

  const millis =
    ms % 1000;

  return (

    `${String(minutes).padStart(2, "0")}:` +

    `${String(seconds).padStart(2, "0")}:` +

    `${String(millis).padStart(3, "0")}`

  );

};


/* =========================================================
   PARTICIPANT TIMER
   FORMAT: MM:SS
   ========================================================= */

const fmtParticipantTime = ms => {

  ms =
    Math.max(
      0,
      Math.ceil(
        Number(ms) || 0
      )
    );

  const totalSeconds =
    Math.ceil(
      ms / 1000
    );

  return (

    `${String(
      Math.floor(
        totalSeconds / 60
      )
    ).padStart(2, "0")}:` +

    `${String(
      totalSeconds % 60
    ).padStart(2, "0")}`

  );

};


/* =========================================================
   BID ELAPSED TIME
   FORMAT: MM:SS:MMM
   ========================================================= */

const fmtBidElapsed = ms => {

  ms =
    Math.max(
      0,
      Math.floor(
        Number(ms) || 0
      )
    );

  const minutes =
    Math.floor(
      ms / 60000
    );

  const seconds =
    Math.floor(
      (ms % 60000) / 1000
    );

  const millis =
    ms % 1000;

  return (

    `${String(minutes).padStart(2, "0")}:` +

    `${String(seconds).padStart(2, "0")}:` +

    `${String(millis).padStart(3, "0")}`

  );

};


/* =========================================================
   LOGIN MESSAGE
   ========================================================= */

function showMessage(
  msg,
  ok = false
) {

  const el =
    $("loginMessage");

  if (!el) {

    return;

  }

  el.textContent =
    msg;

  el.style.color =
    ok
      ? "#86efac"
      : "#fda4af";

}


/* =========================================================
   GENERAL NOTICE
   ========================================================= */

function showNotice(
  msg,
  ok = false
) {

  let box =
    $("medarztNotice");

  if (!box) {

    box =
      document.createElement(
        "div"
      );

    box.id =
      "medarztNotice";

    box.style.cssText =
      "position:fixed;" +
      "right:18px;" +
      "bottom:18px;" +
      "z-index:10000;" +
      "max-width:min(420px,90vw);" +
      "padding:12px 16px;" +
      "border:1px solid #444;" +
      "border-radius:10px;" +
      "background:#111;" +
      "color:#fff;" +
      "box-shadow:0 8px 30px rgba(0,0,0,.45);" +
      "font-weight:600";

    document.body.appendChild(
      box
    );

  }

  box.textContent =
    msg;

  box.style.borderColor =
    ok
      ? "#4ade80"
      : "#d6b65a";

  box.style.color =
    ok
      ? "#86efac"
      : "#fff";

  clearTimeout(
    window.__medarztNoticeTimer
  );

  window.__medarztNoticeTimer =
    setTimeout(
      () => {

        if (box.isConnected) {

          box.remove();

        }

      },
      3200
    );

}


/* =========================================================
   SEND DATA TO SERVER
   ========================================================= */

function send(data) {

  if (
    socket?.readyState ===
    WebSocket.OPEN
  ) {

    socket.send(
      JSON.stringify(data)
    );

  }

}


/* =========================================================
   CONNECT WEBSOCKET
   ========================================================= */

function connectSocket() {

  if (
    socket &&
    [
      WebSocket.OPEN,
      WebSocket.CONNECTING
    ].includes(
      socket.readyState
    )
  ) {

    return;

  }

  socket =
    new WebSocket(
      WS_URL
    );


  socket.onopen =
    () => {

      setText(
        "connectionStatus",
        "● ONLINE"
      );

      $("connectionStatus")
        ?.classList.remove(
          "offline"
        );

      $("connectionStatus")
        ?.classList.add(
          "online"
        );


      /* Participant reconnect */

      if (
        role === "participant" &&
        teamId
      ) {

        send({

          type:
            "reconnect",

          role:
            "participant",

          teamId

        });

      }


      /* Host reconnect */

      if (
        role === "host"
      ) {

        send({

          type:
            "host-reconnect"

        });

      }

    };


  socket.onclose =
    () => {

      setText(
        "connectionStatus",
        "● OFFLINE"
      );

      $("connectionStatus")
        ?.classList.remove(
          "online"
        );

      $("connectionStatus")
        ?.classList.add(
          "offline"
        );


      setTimeout(
        connectSocket,
        2000
      );

    };


  socket.onerror =
    error => {

      console.error(
        "WebSocket error:",
        error
      );

    };


  socket.onmessage =
    event => {

      try {

        const data =
          JSON.parse(
            event.data
          );

        handleServerMessage(
          data
        );

      } catch (error) {

        console.error(
          "Message parse error:",
          error
        );

      }

    };

}


/* =========================================================
   WAIT UNTIL SOCKET IS READY
   ========================================================= */

function waitSocket(
  callback
) {

  connectSocket();

  const waitTimer =
    setInterval(
      () => {

        if (
          socket?.readyState ===
          WebSocket.OPEN
        ) {

          clearInterval(
            waitTimer
          );

          callback();

        }

      },
      50
    );

  setTimeout(
    () => {

      clearInterval(
        waitTimer
      );

    },
    5000
  );

}


/* =========================================================
   SERVER MESSAGE
   ========================================================= */

function handleServerMessage(
  data
) {

  /* -------------------------------------------------------
     STATE
     ------------------------------------------------------- */

  if (
    data.type ===
    "state"
  ) {

    gameState =
      data.state ||
      gameState;

    teams =
      data.teams ||
      {};


    if (
      !Array.isArray(
        gameState.images
      )
    ) {

      gameState.images =
        gameState.image
          ? [gameState.image]
          : [];

    }


    updateEverything();

    return;

  }


  /* -------------------------------------------------------
     TEAM CREATED
     ------------------------------------------------------- */

  if (
    data.type ===
    "team-created"
  ) {

    teamId =
      data.teamId;

    localStorage.setItem(
      "medarztTeamId",
      teamId
    );

    return;

  }


  /* -------------------------------------------------------
     TEAM ERROR
     ------------------------------------------------------- */

  if (
    data.type ===
    "team-error"
  ) {

    showMessage(
      data.message
    );

    return;

  }


  /* -------------------------------------------------------
     GENERAL ERROR
     ------------------------------------------------------- */

  if (
    data.type ===
    "error"
  ) {

    showNotice(
      data.message ||
      "Something went wrong."
    );

    return;

  }


  /* -------------------------------------------------------
     HOST LOGIN SUCCESS
     ------------------------------------------------------- */

  if (
    data.type ===
    "host-login-success"
  ) {

    role =
      "host";

    hide(
      $("loginPage")
    );

    show(
      $("hostPage")
    );

    updateEverything();

    return;

  }


  /* -------------------------------------------------------
     PARTICIPANT LOGIN SUCCESS
     ------------------------------------------------------- */

  if (
    data.type ===
    "participant-login-success"
  ) {

    role =
      "participant";

    hide(
      $("loginPage")
    );

    show(
      $("participantPage")
    );

    updateEverything();

    return;

  }


  /* -------------------------------------------------------
     FINAL WINNER
     ------------------------------------------------------- */

  if (
    data.type ===
    "final-winner-selected"
  ) {

    selectedFinalWinnerId =
      data.teamId;

    updateEverything();

    return;

  }


  /* -------------------------------------------------------
     RESET
     ------------------------------------------------------- */

  if (
    data.type ===
    "reset"
  ) {

    localStorage.removeItem(
      "medarztTeamId"
    );

    location.reload();

    return;

  }

}


/* =========================================================
   PARTICIPANT LOGIN
   ========================================================= */

function participantLogin() {

  const name =

    $("teamNameInput")
      ?.value
      .trim();


  if (!name) {

    showMessage(
      "Please enter your team name."
    );

    return;

  }


  waitSocket(
    () => {

      send({

        type:
          "join-team",

        teamName:
          name

      });

    }
  );

}


/* =========================================================
   HOST LOGIN
   ========================================================= */

function hostLogin() {

  const password =

    $("hostPasswordInput")
      ?.value ||
    "";


  if (
    password !==
    HOST_PASSWORD
  ) {

    showMessage(
      "Incorrect host password."
    );

    return;

  }


  waitSocket(
    () => {

      send({

        type:
          "host-login",

        password

      });

    }
  );

}


/* =========================================================
   ROUND 1 — START
   ========================================================= */

function startRound1() {

  const question =

    $("questionInput")
      ?.value
      .trim();


  if (!question) {

    alert(
      "Enter a question first."
    );

    return;

  }


  send({

    type:
      "start-round1",

    questionNumber:

      Number(
        $("questionNumberInput")
          ?.value
      ) || 1,

    question,

    duration:

      Number(
        $("round1DurationInput")
          ?.value
      ) || 30

  });

}


/* =========================================================
   ROUND 1 — CLOSE BIDDING
   ========================================================= */

function closeRound1Bid() {

  send({

    type:
      "close-bidding"

  });

}


/* =========================================================
   ROUND 1 — EVALUATE
   ========================================================= */

function evaluateRound1(
  teamIdToEvaluate,
  correct
) {

  if (
    !teamIdToEvaluate
  ) {

    return;

  }


  send({

    type:
      "evaluate-round1",

    teamId:
      teamIdToEvaluate,

    correct:
      Boolean(correct)

  });

}


/* =========================================================
   ROUND 1 — END
   ========================================================= */

function endRound1() {

  send({

    type:
      "end-round1"

  });

}


/* =========================================================
   BID ORDER
   ========================================================= */

function bidOrderValue(
  team
) {

  return (

    money(
      team.currentBidOrder
    ) ||

    money(
      team.currentBidTime
    ) ||

    Number.MAX_SAFE_INTEGER

  );

}


/* =========================================================
   ORDINAL
   ========================================================= */

function ordinal(n) {

  if (
    n % 100 >= 11 &&
    n % 100 <= 13
  ) {

    return `${n}th`;

  }


  if (
    n % 10 === 1
  ) {

    return `${n}st`;

  }


  if (
    n % 10 === 2
  ) {

    return `${n}nd`;

  }


  if (
    n % 10 === 3
  ) {

    return `${n}rd`;

  }


  return `${n}th`;

}


/* =========================================================
   HOST BID ELAPSED
   ========================================================= */

function bidElapsedText(
  team
) {

  if (
    team?.currentBidTime &&
    gameState.startedAt
  ) {

    return fmtBidElapsed(

      Math.max(

        0,

        Number(
          team.currentBidTime
        ) -

        Number(
          gameState.startedAt
        )

      )

    );

  }


  if (
    team?.currentBidElapsedMs !==
      undefined &&

    team?.currentBidElapsedMs !==
      null
  ) {

    return fmtBidElapsed(

      team.currentBidElapsedMs

    );

  }


  return "—";

}


/* =========================================================
   EXACT BID CLOCK
   HH:MM:SS.mmm
   ========================================================= */

function formatBidClock(
  team
) {

  const value =
    Number(
      team?.currentBidTime ||
      0
    );


  if (!value) {

    return "—";

  }


  const date =
    new Date(value);


  return (

    `${String(
      date.getHours()
    ).padStart(2, "0")}:` +

    `${String(
      date.getMinutes()
    ).padStart(2, "0")}:` +

    `${String(
      date.getSeconds()
    ).padStart(2, "0")}.` +

    `${String(
      date.getMilliseconds()
    ).padStart(3, "0")}`

  );

}


/* =========================================================
   HIGHEST BIDDER
   Highest bid wins.
   Same bid → earliest bid order wins.
   ========================================================= */

function highestBidTeam(
  list =
    Object.values(teams)
) {

  return list

    .filter(

      team =>

        money(
          team.currentBid
        ) > 0

    )

    .sort(

      (a, b) => {

        const bidDifference =

          money(
            b.currentBid
          ) -

          money(
            a.currentBid
          );


        if (
          bidDifference !== 0
        ) {

          return bidDifference;

        }


        return (

          bidOrderValue(a) -

          bidOrderValue(b)

        );

      }

    )[0] || null;

}


/* =========================================================
   ROUND 1 LIVE BIDS
   ========================================================= */

function renderRound1Bids() {

  const hostBox =
    $("round1WinnerBox");

  const qualificationPane =
    $("round1QualificationPane");


  const allTeams =

    Object.values(
      teams
    )

      .filter(

        team =>

          !team.qualified ||

          gameState.round === 1

      )

      .sort(

        (a, b) => {

          const aBid =
            money(
              a.currentBid
            ) > 0;

          const bBid =
            money(
              b.currentBid
            ) > 0;


          if (
            aBid !== bBid
          ) {

            return aBid
              ? -1
              : 1;

          }


          if (
            aBid &&
            bBid
          ) {

            return (

              bidOrderValue(a) -

              bidOrderValue(b)

            );

          }


          return String(
            a.name
          ).localeCompare(
            String(b.name)
          );

        }

      );


  const activeBids =

    allTeams.filter(

      team =>

        money(
          team.currentBid
        ) > 0

    );


  setText(

    "activeBids",

    activeBids.length

  );


  if (hostBox) {

    hostBox.textContent =

      gameState.winnerName

        ? `${gameState.winnerName} — Bid: ${gameState.winnerBid}`

        : "No evaluated team yet";

  }


  let board =

    $("round1LiveBidsBoard");


  if (!board) {

    board =
      document.createElement(
        "div"
      );

    board.id =
      "round1LiveBidsBoard";

    board.className =
      "panel";


    $("hostRound1Panel")
      ?.insertBefore(

        board,

        $("round1QualificationPane")

      );

  }


  if (!allTeams.length) {

    board.innerHTML =

      "<h3>Live Bids</h3>" +

      "<p class='note'>" +

      "No teams have joined yet." +

      "</p>";

    return;

  }


  const activeOrder =

    new Map(

      activeBids.map(

        (team, index) => [

          team.id,

          index + 1

        ]

      )

    );


  const highest =
    highestBidTeam(
      activeBids
    );


  board.innerHTML = `

    <h3>

      ROUND 1 LIVE BIDS

    </h3>


    <p class="note">

      Highest bid gets the answer chance.

      Same highest bid → earliest bid wins.

    </p>


    <div

      style="

        display:grid;

        gap:8px;

        max-height:520px;

        overflow:auto

      "

    >

      ${

        allTeams

          .map(

            team => {

              const bid =
                money(
                  team.currentBid
                );

              const evaluation =

                team.currentEvaluation ||

                "pending";

              const evaluated =

                evaluation !==
                "pending";

              const isHighest =

                highest?.id ===
                team.id;

              const order =

                activeOrder.get(
                  team.id
                );

              const orderText =

                order
                  ? ordinal(order)
                  : "—";

              const canEvaluate =

                gameState.status ===
                  "evaluating" &&

                isHighest &&

                !evaluated &&

                bid > 0;


              const status =

                evaluation ===
                  "correct"

                  ? "<span style='color:#86efac'>✓ CORRECT</span>"

                  : evaluation ===
                    "wrong"

                    ? "<span style='color:#fda4af'>✕ WRONG</span>"

                    : isHighest

                      ? "<span style='color:#d6b65a'>HIGHEST — ANSWER</span>"

                      : bid

                        ? "<span style='color:#aaa'>BID SUBMITTED</span>"

                        : "<span style='color:#777'>NO BID</span>";


              return `

                <div

                  style="

                    display:grid;

                    grid-template-columns:

                      58px

                      1fr

                      90px

                      150px

                      150px

                      auto;

                    gap:10px;

                    align-items:center;

                    border:1px solid ${

                      isHighest

                        ? "#d6b65a"

                        : "#292929"

                    };

                    border-radius:10px;

                    padding:10px;

                    background:#070707

                  "

                >

                  <strong

                    style="color:#d6b65a"

                  >

                    ${orderText}

                  </strong>


                  <strong>

                    ${esc(
                      team.name
                    )}

                  </strong>


                  <strong>

                    ${bid}

                    pts

                  </strong>


                  <span>

                    ${

                      bid

                        ? formatBidClock(
                            team
                          )

                        : "—"

                    }

                  </span>


                  <span>

                    ${status}

                  </span>


                  <span

                    style="

                      display:flex;

                      gap:6px;

                      justify-content:flex-end

                    "

                  >

                    <button

                      class="btn green"

                      data-r1-correct="${esc(
                        team.id
                      )}"

                      ${

                        canEvaluate

                          ? ""

                          : "disabled"

                      }

                    >

                      ✓ CORRECT

                    </button>


                    <button

                      class="btn red"

                      data-r1-wrong="${esc(
                        team.id
                      )}"

                      ${

                        canEvaluate

                          ? ""

                          : "disabled"

                      }

                    >

                      ✕ WRONG

                    </button>

                  </span>

                </div>

              `;

            }

          )

          .join("")

      }

    </div>

  `;


  board

    .querySelectorAll(
      "[data-r1-correct]"
    )

    .forEach(

      button => {

        button.onclick =

          () =>

            evaluateRound1(

              button.dataset
                .r1Correct,

              true

            );

      }

    );


  board

    .querySelectorAll(
      "[data-r1-wrong]"
    )

    .forEach(

      button => {

        button.onclick =

          () =>

            evaluateRound1(

              button.dataset
                .r1Wrong,

              false

            );

      }

    );


  if (
    qualificationPane &&
    gameState.status !==
      "round1-ended"
  ) {

    qualificationPane.innerHTML =
      "";

  }

}
/* =========================================================
   ROUND 1 — MANUAL TEAM SELECTION FOR ROUND 2
   ========================================================= */

function renderRound1Selection() {

  const pane =
    $("round1QualificationPane");

  if (!pane) {

    return;

  }


  if (
    !gameState.round1Ended ||
    gameState.round !== 1
  ) {

    pane.innerHTML = "";

    hide(pane);

    return;

  }


  show(pane);


  const list =

    Object.values(
      teams
    ).sort(

      (a, b) =>
        money(b.points) -
        money(a.points) ||

        String(a.name).localeCompare(
          String(b.name)
        )

    );


  const selectedFromState =

    new Set(

      Array.isArray(
        gameState.qualifiedTeamIds
      )

        ? gameState.qualifiedTeamIds

        : []

    );


  pane.innerHTML = `

    <div class="panel">

      <h3>

        ROUND 1 FINAL — SELECT TEAMS FOR ROUND 2

      </h3>


      <p class="note">

        Host manually selects the teams.

        Every selected team automatically receives

        <strong>+100 points</strong>.

      </p>


      <div

        style="

          display:grid;

          gap:8px;

          max-height:560px;

          overflow:auto

        "

      >

        ${
          list.length

            ? list
                .map(

                  (team, index) => `

                    <label

                      style="

                        display:grid;

                        grid-template-columns:

                          28px

                          42px

                          1fr

                          100px

                          80px

                          80px

                          90px;

                        gap:8px;

                        align-items:center;

                        border:1px solid #292929;

                        border-radius:9px;

                        padding:10px;

                        cursor:pointer

                      "

                    >

                      <input

                        type="checkbox"

                        class="qualify-check"

                        value="${esc(
                          team.id
                        )}"

                        ${
                          selectedFromState.has(
                            team.id
                          )
                            ? "checked"
                            : ""
                        }

                      >


                      <span>

                        #${index + 1}

                      </span>


                      <strong>

                        ${esc(
                          team.name
                        )}

                      </strong>


                      <span>

                        ${money(
                          team.points
                        )}

                        pts

                      </span>


                      <span>

                        ✓

                        ${money(
                          team.correctAnswers
                        )}

                      </span>


                      <span>

                        ✕

                        ${money(
                          team.wrongAnswers
                        )}

                      </span>


                      <span>

                        Won

                        ${money(
                          team.itemsWon
                        )}

                      </span>

                    </label>

                  `

                )

                .join("")

            : `

                <p class="note">

                  No teams available.

                </p>

              `
        }

      </div>


      <div

        class="toolbar"

        style="margin-top:12px"

      >

        <button

          id="confirmManualQualification"

          class="btn gold"

        >

          MOVE SELECTED TO ROUND 2

        </button>


        <span

          id="selectedCount"

          class="note"

        ></span>

      </div>

    </div>

  `;


  const updateCount = () => {

    const count =

      pane.querySelectorAll(
        ".qualify-check:checked"
      ).length;


    setText(

      "selectedCount",

      `${count} team(s) selected · +100 each`

    );

  };


  pane
    .querySelectorAll(
      ".qualify-check"
    )
    .forEach(

      input => {

        input.addEventListener(

          "change",

          updateCount

        );

      }

    );


  updateCount();


  $("confirmManualQualification")
    ?.addEventListener(

      "click",

      () => {

        const ids = [

          ...pane.querySelectorAll(
            ".qualify-check:checked"
          )

        ].map(

          input =>
            input.value

        );


        if (!ids.length) {

          showNotice(
            "Select at least one team."
          );

          return;

        }


        send({

          type:
            "qualify-round2",

          selectedTeamIds:
            ids

        });

      }

    );

}


/* =========================================================
   ROUND 1 FINAL SUMMARY
   ========================================================= */

function renderRound1Summary() {

  const box =
    $("round1Summary");

  if (!box) {

    return;

  }


  if (

    !Array.isArray(
      gameState.round1Summary
    ) ||

    !gameState.round1Summary.length

  ) {

    box.innerHTML = "";

    return;

  }


  const rows =

    gameState.round1Summary

      .map(

        team => `

          <tr>

            <td>

              ${esc(
                team.name
              )}

            </td>


            <td>

              ${money(
                team.points
              )}

            </td>


            <td>

              ${money(
                team.correctAnswers
              )}

            </td>


            <td>

              ${money(
                team.wrongAnswers
              )}

            </td>


            <td>

              ${money(
                team.itemsWon
              )}

            </td>

          </tr>

        `

      )

      .join("");


  box.innerHTML = `

    <h3>

      Round 1 Final Summary

    </h3>


    <div class="table-wrap">

      <table class="table">

        <thead>

          <tr>

            <th>Team</th>

            <th>Final Points</th>

            <th>Correct</th>

            <th>Wrong</th>

            <th>Images Won</th>

          </tr>

        </thead>


        <tbody>

          ${rows}

        </tbody>

      </table>

    </div>

  `;

}


/* =========================================================
   ROUND 2 — HOST PANEL
   ONE IMAGE AT A TIME
   ========================================================= */

function renderRound2Host() {

  const hostPanel =
    $("hostRound2Panel");


  if (
    gameState.round !== 2
  ) {

    if (hostPanel) {

      hide(hostPanel);

    }

    return;

  }


  if (!hostPanel) {

    return;

  }


  show(hostPanel);


  hide(
    $("round1QualificationPane")
  );


  let pane =
    $("round2DynamicPane");


  if (!pane) {

    pane =
      document.createElement(
        "div"
      );

    pane.id =
      "round2DynamicPane";

    hostPanel.appendChild(
      pane
    );

  }


  const qualified =

    Object.values(
      teams
    )

      .filter(
        team =>
          team.qualified
      )

      .sort(

        (a, b) => {

          const aBid =
            money(
              a.currentBid
            ) > 0;

          const bBid =
            money(
              b.currentBid
            ) > 0;


          if (
            aBid !== bBid
          ) {

            return aBid
              ? -1
              : 1;

          }


          if (
            aBid &&
            bBid
          ) {

            return (

              bidOrderValue(a) -
              bidOrderValue(b)

            );

          }


          return String(
            a.name
          ).localeCompare(
            String(b.name)
          );

        }

      );


  const currentNumber =

    Number(
      gameState.round2ImageNumber ||
      0
    );


  const totalImages =

    Number(
      gameState.round2TotalImages ||
      6
    );


  const bidding =

    gameState.status ===
    "bidding";


  const evaluating =

    gameState.status ===
    "evaluating";


  const idle =

    gameState.status ===
    "idle";


  const highest =

    highestBidTeam(
      qualified
    );


  pane.innerHTML = `

    <div class="panel">

      <h3>

        ROUND 2 — MEDICAL EQUIPMENT BIDDING

      </h3>


      <p class="note">

        Teams use their hard-copy paragraph/details

        as the offline reference.

        Host uploads one medical equipment image

        at a time.

      </p>


      <div

        style="

          display:flex;

          gap:12px;

          flex-wrap:wrap;

          align-items:center

        "

      >

        <strong>

          IMAGE

          ${currentNumber || 1}

          /

          ${totalImages}

        </strong>


        <span class="note">

          Every submitted bid is deducted

          immediately from the team's points.

        </span>

      </div>


      ${
        currentNumber === 0

          ? `

            <div

              style="

                display:flex;

                gap:12px;

                align-items:center;

                flex-wrap:wrap;

                margin-top:12px

              "

            >

              <label>

                <strong>

                  NUMBER OF IMAGES:

                </strong>


                <select

                  id="round2ImageCountInput"

                  class="input"

                >

                  <option value="6">

                    6

                  </option>

                  <option value="7">

                    7

                  </option>

                  <option value="8">

                    8

                  </option>

                </select>

              </label>


              <span class="note">

                Choose 6, 7 or 8 images.

              </span>

            </div>

          `

          : `

            <p

              class="note"

              style="margin-top:10px"

            >

              After evaluating the current answer,

              click

              <strong>

                NEXT QUESTION / NEXT IMAGE

              </strong>

              to prepare the next image.

            </p>

          `

      }


      <div

        style="

          display:flex;

          gap:10px;

          align-items:center;

          flex-wrap:wrap;

          margin-top:12px

        "

      >

        <input

          id="round2ImageUploadDynamic"

          type="file"

          accept="image/*"

          ${
            !idle ||
            currentNumber >= totalImages

              ? "disabled"

              : ""

          }

        >


        <label>

          Duration


          <input

            id="round2DurationInputDynamic"

            type="number"

            min="5"

            value="30"

            class="input"

            style="width:90px"

            ${
              !idle ||
              currentNumber >= totalImages

                ? "disabled"

                : ""

            }

          >


          sec

        </label>


        <button

          id="round2StartImageDynamic"

          class="btn gold"

          ${
            !idle ||
            currentNumber >= totalImages

              ? "disabled"

              : ""

          }

        >

          START IMAGE

          ${

            Math.min(

              currentNumber + 1,

              totalImages

            )

          }

        </button>


        <span

          id="round2UploadPreviewDynamic"

        ></span>

      </div>


      ${
        gameState.image

          ? `

            <div

              style="

                display:flex;

                justify-content:center;

                margin:14px 0

              "

            >

              <img

                src="${esc(
                  gameState.image
                )}"

                alt="Medical equipment"

                data-r2-host-image="1"

                style="

                  width:min(330px,82vw);

                  height:390px;

                  object-fit:contain;

                  background:#111;

                  border-radius:8px;

                  cursor:zoom-in

                "

              >

            </div>

          `

          : ""

      }


      <div

        style="

          display:flex;

          gap:10px;

          align-items:center;

          flex-wrap:wrap

        "

      >

        <strong>

          TIME:

        </strong>


        <span

          id="round2HostTimerDisplay"

          style="

            font-size:28px;

            font-weight:800;

            color:#d6b65a

          "

        >

          ${fmtTime(

            Math.max(

              0,

              Number(
                gameState.endsAt || 0
              ) -

              Date.now()

            )

          )}

        </span>


        ${
          bidding

            ? `

              <button

                id="round2CloseBidDynamic"

                class="btn"

              >

                CLOSE BIDDING

              </button>

            `

            : ""

        }

      </div>


      ${
        evaluating

          ? `

            ${
              highest

                ? `

                  <div

                    style="

                      margin-top:14px;

                      border:1px solid #d6b65a;

                      border-radius:10px;

                      padding:14px

                    "

                  >

                    <div>

                      <strong>

                        HIGHEST BIDDER:

                        ${esc(
                          highest.name
                        )}

                      </strong>


                      <span>

                        —

                        BID:

                        ${money(
                          highest.currentBid
                        )}

                        POINTS

                      </span>

                    </div>


                    <div

                      style="

                        margin-top:7px;

                        font-size:13px;

                        color:#aaa

                      "

                    >

                      BID CLICKED AT:

                      <strong>

                        ${formatBidClock(
                          highest
                        )}

                      </strong>


                      · ORDER #

                      ${money(
                        highest.currentBidOrder
                      )}


                      · ELAPSED

                      ${bidElapsedText(
                        highest
                      )}


                      · POINTS LEFT:

                      ${money(
                        highest.points
                      )}

                    </div>


                    ${
                      highest.currentEvaluation ===
                      "pending"

                        ? `

                          <div

                            style="

                              display:flex;

                              gap:9px;

                              flex-wrap:wrap;

                              margin-top:12px

                            "

                          >

                            <button

                              class="btn green"

                              data-r2-correct="${esc(
                                highest.id
                              )}"

                            >

                              ✓ CORRECT

                            </button>


                            <button

                              class="btn red"

                              data-r2-wrong="${esc(
                                highest.id
                              )}"

                            >

                              ✕ WRONG

                            </button>

                          </div>

                        `

                        : `

                          <div

                            style="

                              margin-top:12px;

                              font-weight:700;

                              color:${
                                highest.currentEvaluation ===
                                "correct"

                                  ? "#86efac"

                                  : "#fda4af"

                              }

                            "

                          >

                            ${
                              highest.currentEvaluation ===
                              "correct"

                                ? "✓ CORRECT — IMAGE WON"

                                : "✕ WRONG — NO IMAGE"

                            }


                            <br>


                            <small>

                              Bid was already deducted

                              when submitted.

                            </small>

                          </div>

                        `

                    }

                  </div>

                `

                : `

                  <div

                    class="note"

                    style="margin-top:12px"

                  >

                    No qualified team placed

                    a bid for this image.

                  </div>

                `

            }


            ${
              currentNumber < totalImages

                ? `

                  <button

                    id="round2NextImageDynamic"

                    class="btn gold"

                    style="margin-top:12px"

                    ${
                      highest &&
                      highest.currentEvaluation ===
                        "pending"

                        ? "disabled"

                        : ""

                    }

                  >

                    NEXT QUESTION / NEXT IMAGE

                  </button>

                `

                : `

                  <button

                    id="round2EndDynamic"

                    class="btn gold"

                    style="margin-top:12px"

                    ${
                      highest &&
                      highest.currentEvaluation ===
                        "pending"

                        ? "disabled"

                        : ""

                    }

                  >

                    END ROUND 2

                  </button>

                `

            }

          `

          : ""

      }

    </div>

  `;


  /* =======================================================
     ROUND 2 EVENTS
     ======================================================= */

  $("round2ImageUploadDynamic")

    ?.addEventListener(

      "change",

      previewRound2Image

    );


  $("round2StartImageDynamic")

    ?.addEventListener(

      "click",

      startRound2Image

    );


  $("round2CloseBidDynamic")

    ?.addEventListener(

      "click",

      closeRound2Bid

    );


  $("round2NextImageDynamic")

    ?.addEventListener(

      "click",

      () => {

        send({

          type:
            "next-round2"

        });

      }

    );


  $("round2EndDynamic")

    ?.addEventListener(

      "click",

      () => {

        send({

          type:
            "end-round2"

        });

      }

    );


  pane

    .querySelector(
      "[data-r2-correct]"
    )

    ?.addEventListener(

      "click",

      event => {

        evaluateRound2(

          event.currentTarget
            .dataset
            .r2Correct,

          "correct"

        );

      }

    );


  pane

    .querySelector(
      "[data-r2-wrong]"
    )

    ?.addEventListener(

      "click",

      event => {

        evaluateRound2(

          event.currentTarget
            .dataset
            .r2Wrong,

          "wrong"

        );

      }

    );


  pane

    .querySelector(
      "[data-r2-host-image]"
    )

    ?.addEventListener(

      "click",

      () => {

        openImageViewer(

          0,

          getCurrentReportImages()

        );

      }

    );


  /* =======================================================
     ROUND 2 LIVE BIDS BOARD
     ======================================================= */

  let board =
    $("round2LiveBidsBoard");


  if (!board) {

    board =
      document.createElement(
        "div"
      );

    board.id =
      "round2LiveBidsBoard";

    board.className =
      "panel";

    hostPanel.appendChild(
      board
    );

  }


  board.innerHTML = `

    <h3>

      ROUND 2 LIVE BIDS —

      IMAGE

      ${currentNumber || 0}

      /

      ${totalImages}

    </h3>


    <p class="note">

      Every qualified team's bid,

      bid order, exact click time,

      elapsed time and remaining points

      are visible here.

    </p>


    <div

      style="

        display:grid;

        gap:8px;

        max-height:620px;

        overflow:auto

      "

    >

      ${
        qualified.length

          ? qualified

              .map(

                team => {

                  const bid =
                    money(
                      team.currentBid
                    );

                  const evaluation =
                    team.currentEvaluation ||
                    "pending";

                  const isHighest =
                    highest?.id ===
                    team.id;


                  return `

                    <div

                      style="

                        display:grid;

                        grid-template-columns:

                          45px

                          1fr

                          100px

                          180px

                          80px

                          230px;

                        gap:10px;

                        align-items:center;

                        border:1px solid ${
                          isHighest
                            ? "#d6b65a"
                            : "#292929"
                        };

                        border-radius:10px;

                        padding:10px;

                        background:#070707

                      "

                    >

                      <strong>

                        ${
                          bid

                            ? `#${money(
                                team.currentBidOrder
                              )}`

                            : "—"

                        }

                      </strong>


                      <div>

                        <strong>

                          ${esc(
                            team.name
                          )}

                        </strong>


                        <div

                          style="

                            font-size:12px;

                            color:#999

                          "

                        >

                          Remaining:

                          ${money(
                            team.points
                          )}

                          pts


                          ·


                          Images Won:

                          ${money(
                            team.itemsWon
                          )}

                        </div>

                      </div>


                      <strong>

                        ${bid || 0}

                        pts

                      </strong>


                      <span>

                        ${formatBidClock(
                          team
                        )}

                        ·

                        ${bidElapsedText(
                          team
                        )}

                      </span>


                      <span>

                        ${
                          isHighest

                            ? "HIGHEST"

                            : bid

                              ? "BID"

                              : "NO BID"

                        }

                      </span>


                      <span>

                        ${
                          evaluation ===
                          "correct"

                            ? "✓ CORRECT — IMAGE WON"

                            : evaluation ===
                              "wrong"

                              ? "✕ WRONG — NO IMAGE"

                              : isHighest

                                ? "HIGHEST — ANSWER THIS TEAM"

                                : bid

                                  ? "BID SUBMITTED"

                                  : "WAITING"

                        }

                      </span>

                    </div>

                  `;

                }

              )

              .join("")

          : `

              <p class="note">

                No qualified teams.

              </p>

            `

      }

    </div>

  `;


  setText(

    "round2WinnerBox",

    highest

      ? `Highest bidder: ${highest.name} — ${money(
          highest.currentBid
        )} pts`

      : evaluating

        ? "No bid submitted for this image"

        : bidding

          ? "Bidding is open"

          : `Ready for image ${Math.min(
              currentNumber + 1,
              totalImages
            )}`

  );


  renderRound2UploadPreview();

}


/* =========================================================
   FILE READER
   ========================================================= */

function readFileAsDataURL(
  file
) {

  return new Promise(

    (resolve, reject) => {

      if (!file) {

        return resolve(
          null
        );

      }


      if (
        !file.type.startsWith(
          "image/"
        )
      ) {

        reject(

          new Error(
            "Please select an image file."
          )

        );

        return;

      }


      const reader =
        new FileReader();


      reader.onload =
        () => {

          resolve(
            reader.result
          );

        };


      reader.onerror =
        () => {

          reject(

            new Error(
              "Unable to read image."
            )

          );

        };


      reader.readAsDataURL(
        file
      );

    }

  );

}


/* =========================================================
   ROUND 2 IMAGE PREVIEW
   ========================================================= */

async function previewRound2Image() {

  const input =
    getRound2UploadInput();


  const file =
    input?.files?.[0];


  if (!file) {

    selectedRound2Image =
      null;

    renderRound2UploadPreview();

    return;

  }


  if (

    gameState.round !== 2 ||

    gameState.status !== "idle"

  ) {

    selectedRound2Image =
      null;

    renderRound2UploadPreview();


    showNotice(

      "Choose the next image only after the current answer is evaluated."

    );

    return;

  }


  try {

    selectedRound2Image =

      await readFileAsDataURL(
        file
      );


    renderRound2UploadPreview();

  } catch (error) {

    selectedRound2Image =
      null;

    showNotice(
      error.message
    );

  }

}


/* =========================================================
   ROUND 2 UPLOAD PREVIEW
   ========================================================= */

function renderRound2UploadPreview() {

  const preview =

    $("round2UploadPreviewDynamic") ||

    $("round2UploadPreview");


  if (!preview) {

    return;

  }


  if (!selectedRound2Image) {

    preview.innerHTML =

      "<span class='note'>" +

      "Choose ONE image for this question." +

      "</span>";

    return;

  }


  preview.innerHTML = `

    <div

      style="

        display:flex;

        align-items:center;

        gap:8px;

        flex-wrap:wrap

      "

    >

      <img

        src="${esc(
          selectedRound2Image
        )}"

        alt="Selected medical equipment"

        style="

          width:80px;

          height:105px;

          object-fit:contain;

          background:#111;

          border-radius:6px;

          cursor:zoom-in

        "

      >


      <span class="note">

        IMAGE READY — click START IMAGE

      </span>

    </div>

  `;


  preview

    .querySelector("img")

    ?.addEventListener(

      "click",

      () => {

        openImageViewer(

          0,

          [
            selectedRound2Image
          ]

        );

      }

    );

}


/* =========================================================
   START ROUND 2 IMAGE
   ========================================================= */

async function startRound2Image() {

  if (

    !gameState
      .qualifiedTeamIds
      ?.length

  ) {

    showNotice(

      "Select and confirm the Round 2 teams first."

    );

    return;

  }


  if (

    gameState.round !== 2 ||

    gameState.status !== "idle"

  ) {

    showNotice(

      "Finish the current Round 2 question first."

    );

    return;

  }


  const currentNumber =

    Number(

      gameState.round2ImageNumber ||
      0

    );


  let totalImages =

    Number(

      gameState.round2TotalImages ||
      0

    );


  if (
    currentNumber === 0
  ) {

    totalImages =

      Number(

        $("round2ImageCountInput")
          ?.value

      ) || 6;

  }


  if (
    ![6, 7, 8].includes(
      totalImages
    )
  ) {

    showNotice(

      "Choose 6, 7 or 8 images."

    );

    return;

  }


  if (
    currentNumber >=
    totalImages
  ) {

    showNotice(

      "All Round 2 images are complete."

    );

    return;

  }


  const input =
    getRound2UploadInput();


  const file =
    input?.files?.[0];


  if (!file) {

    showNotice(

      "Choose ONE image for this question."

    );

    return;

  }


  try {

    selectedRound2Image =

      await readFileAsDataURL(
        file
      );

  } catch (error) {

    showNotice(
      error.message
    );

    return;

  }


  if (!selectedRound2Image) {

    showNotice(
      "Choose a valid image."
    );

    return;

  }


  send({

    type:
      "start-round2",

    image:
      selectedRound2Image,

    totalImages,

    duration:

      Number(

        $("round2DurationInputDynamic")
          ?.value

      ) || 30

  });


  selectedRound2Image =
    null;

}


/* =========================================================
   ROUND 2 IMAGE INPUT
   ========================================================= */

function getRound2UploadInput() {

  return (

    $("round2ImageUploadDynamic") ||

    $("round2ImageUpload") ||

    null

  );

}


/* =========================================================
   ROUND 2 DURATION INPUT
   ========================================================= */

function getRound2DurationInput() {

  return (

    $("round2DurationInputDynamic") ||

    $("round2DurationInput") ||

    null

  );

}


/* =========================================================
   ROUND 2 CLOSE BIDDING
   ========================================================= */

function closeRound2Bid() {

  send({

    type:
      "close-bidding"

  });

}


/* =========================================================
   ROUND 2 EVALUATION
   =========================================================

   Only highest bidder gets evaluated.

   correct:
     +1 correct
     +1 image won

   wrong:
     +1 wrong
     +0 image won

   Bid has already been deducted.
   ========================================================= */

function evaluateRound2(

  teamIdToEvaluate,

  result

) {

  if (
    !teamIdToEvaluate
  ) {

    return;

  }


  if (
    result !== "correct" &&
    result !== "wrong"
  ) {

    return;

  }


  send({

    type:
      "evaluate-round2",

    teamId:
      teamIdToEvaluate,

    correct:
      result === "correct"

  });

}


/* =========================================================
   CURRENT REPORT IMAGE
   ========================================================= */

function getCurrentReportImages() {

  if (

    Array.isArray(
      gameState.images
    ) &&

    gameState.images.length

  ) {

    return gameState.images;

  }


  return gameState.image

    ? [gameState.image]

    : [];

}
/* =========================================================
   PARTICIPANT BID
   ========================================================= */

function placeBid() {

  const bid =

    Number(
      $("bidInput")?.value
    );


  const me =

    teams[teamId];


  if (!me) {

    setText(

      "bidMessage",

      "Your team session is not ready."

    );

    return;

  }


  if (

    gameState.status !==
    "bidding"

  ) {

    setText(

      "bidMessage",

      "Bidding is currently closed."

    );

    return;

  }


  if (

    !Number.isInteger(bid) ||

    bid < 1

  ) {

    setText(

      "bidMessage",

      "Enter a valid whole-number bid."

    );

    return;

  }


  const availablePoints =

    Math.max(

      0,

      money(me.points)

    );


  if (

    bid >
    availablePoints

  ) {

    setText(

      "bidMessage",

      `Maximum bid is ${availablePoints} points.`

    );

    return;

  }


  /* Round 1 maximum = 15 */

  if (

    gameState.round === 1 &&

    bid >
    Number(

      gameState.maxBid ||
      15

    )

  ) {

    setText(

      "bidMessage",

      `Round 1 maximum bid is ${Number(
        gameState.maxBid || 15
      )} points.`

    );

    return;

  }


  /* Only qualified teams can bid Round 2 */

  if (

    gameState.round === 2 &&

    !me.qualified

  ) {

    setText(

      "bidMessage",

      "Your team is not qualified for Round 2."

    );

    return;

  }


  /* Only one bid per question */

  if (

    money(
      me.currentBid
    ) > 0

  ) {

    setText(

      "bidMessage",

      "You already placed your bid."

    );

    return;

  }


  send({

    type:
      "place-bid",

    bid

  });

}


/* =========================================================
   TIMER
   ========================================================= */

function updateTimer() {

  const remaining =

    Math.max(

      0,

      money(

        gameState.endsAt

      ) -

      Date.now()

    );


  setText(

    "hostLiveTimer",

    fmtTime(
      remaining
    )

  );


  setText(

    "roundTimer",

    fmtTime(
      remaining
    )

  );


  setText(

    "round2HostTimerDisplay",

    fmtTime(
      remaining
    )

  );


  setText(

    "participantLiveTimer",

    fmtParticipantTime(
      remaining
    )

  );


  if (

    remaining <= 0 &&

    timerInterval

  ) {

    clearInterval(
      timerInterval
    );

    timerInterval =
      null;

  }

}


function startTimerLoop() {

  if (timerInterval) {

    clearInterval(
      timerInterval
    );

  }


  timerInterval =

    setInterval(

      updateTimer,

      250

    );


  updateTimer();

}


/* =========================================================
   OVERVIEW
   ========================================================= */

function updateOverview() {

  const list =

    Object.values(
      teams
    ).sort(

      (a, b) =>

        money(b.points) -
        money(a.points)

    );


  setText(

    "currentRoundNumber",

    gameState.round === 3

      ? "FINAL"

      : gameState.round ||
        0

  );


  setText(

    "totalTeams",

    list.length

  );


  setText(

    "overviewRound",

    gameState.round === 1

      ? "ROUND 1"

      : gameState.round === 2

        ? "ROUND 2"

        : gameState.round === 3

          ? "FINAL"

          : "LOBBY"

  );


  setText(

    "overviewContent",

    gameState.content ||
    "Waiting for host..."

  );


  setText(

    "activeBids",

    list.filter(

      team =>

        money(
          team.currentBid
        ) > 0

    ).length

  );


  const body =

    $("teamsTableBody");


  if (!body) {

    return;

  }


  body.innerHTML =

    list.length

      ? list

          .map(

            (team, index) => `

              <tr>

                <td>

                  ${index + 1}

                </td>


                <td class="team-name">

                  ${esc(
                    team.name
                  )}

                </td>


                <td>

                  ${money(
                    team.points
                  )}

                </td>


                <td>

                  ${money(
                    team.currentBid
                  )}

                </td>


                <td>

                  ${money(
                    team.correctAnswers
                  )}

                </td>


                <td>

                  ${money(
                    team.wrongAnswers
                  )}

                </td>


                <td>

                  ${money(
                    team.itemsWon
                  )}

                </td>


                <td>

                  ${
                    team.qualified
                      ? "QUALIFIED"
                      : "—"
                  }

                </td>

              </tr>

            `

          )

          .join("")

      : `

          <tr>

            <td colspan="8">

              No teams joined yet.

            </td>

          </tr>

        `;

}


/* =========================================================
   PARTICIPANT
   ========================================================= */

function updateParticipant() {

  const me =

    teams[teamId];


  if (!me) {

    return;

  }


  setText(

    "participantTeamName",

    me.name

  );


  setText(

    "participantPoints",

    money(
      me.points
    )

  );


  setText(

    "participantImagesWon",

    money(
      me.itemsWon
    )

  );


  setText(

    "participantRoundLabel",

    gameState.round === 1

      ? "ROUND 1"

      : gameState.round === 2

        ? "ROUND 2"

        : gameState.round === 3

          ? "FINAL"

          : "LOBBY"

  );


  setText(

    "participantStatusLabel",

    String(

      gameState.status ||
      "IDLE"

    ).toUpperCase()

  );


  setText(

    "participantQualification",

    gameState.round === 2

      ? (

          me.qualified

            ? "QUALIFIED"

            : "NOT QUALIFIED"

        )

      : "TEAM"

  );


  /* =======================================================
     ROUND 1
     ======================================================= */

  if (

    gameState.round === 1

  ) {

    show(
      $("participantQuestionArea")
    );

    hide(
      $("participantImageArea")
    );

    hide(
      $("participantFinal")
    );


    setText(

      "participantQuestion",

      gameState.content ||
      "Waiting for the host..."

    );


    const canBid =

      gameState.status ===
        "bidding" &&

      money(
        me.currentBid
      ) === 0;


    if (canBid) {

      show(
        $("biddingArea")
      );

    } else {

      hide(
        $("biddingArea")
      );

    }


    $("bidInput")
      ?.setAttribute(

        "max",

        String(

          Number(
            gameState.maxBid ||
            15
          )

        )

      );


    setText(

      "maxBidDisplay",

      `MAX ${Number(
        gameState.maxBid ||
        15
      )}`

    );


    setText(

      "bidMessage",

      me.currentBid > 0

        ? "Bid submitted. Waiting for host."

        : ""

    );


    return;

  }


  /* =======================================================
     ROUND 2
     ======================================================= */

  if (

    gameState.round === 2

  ) {

    hide(
      $("participantQuestionArea")
    );

    hide(
      $("participantFinal")
    );


    if (

      gameState.image ||
      gameState.images?.length

    ) {

      show(
        $("participantImageArea")
      );

      renderParticipantReportImages();

    } else {

      hide(
        $("participantImageArea")
      );

    }


    const canBid =

      gameState.status ===
        "bidding" &&

      me.qualified &&

      money(
        me.currentBid
      ) === 0;


    if (canBid) {

      show(
        $("biddingArea")
      );

    } else {

      hide(
        $("biddingArea")
      );

    }


    $("bidInput")
      ?.setAttribute(

        "max",

        String(

          Math.max(

            0,

            money(
              me.points
            )

          )

        )

      );


    setText(

      "maxBidDisplay",

      `UP TO ${Math.max(
        0,
        money(me.points)
      )} POINTS`

    );


    if (

      me.currentBid > 0

    ) {

      setText(

        "bidMessage",

        `Bid ${money(
          me.currentBid
        )} submitted. Remaining points: ${money(
          me.points
        )}.`

      );

    } else if (

      gameState.status ===
      "bidding" &&

      me.qualified

    ) {

      setText(

        "bidMessage",

        "Place your bid."

      );

    } else {

      setText(

        "bidMessage",

        ""

      );

    }


    return;

  }


  /* =======================================================
     FINAL
     ======================================================= */

  if (

    gameState.round === 3

  ) {

    hide(
      $("participantQuestionArea")
    );

    hide(
      $("participantImageArea")
    );

    hide(
      $("biddingArea")
    );


    show(
      $("participantFinal")
    );


    renderParticipantFinal();

    return;

  }


  /* =======================================================
     LOBBY
     ======================================================= */

  show(
    $("participantQuestionArea")
  );

  hide(
    $("participantImageArea")
  );

  hide(
    $("participantFinal")
  );

  hide(
    $("biddingArea")
  );


  setText(

    "participantQuestion",

    "Waiting for the host..."

  );

}


/* =========================================================
   PARTICIPANT CURRENT REPORT IMAGE
   ========================================================= */

function renderParticipantReportImages() {

  const area =

    $("participantImageArea");


  if (!area) {

    return;

  }


  const images =

    getCurrentReportImages();


  if (!images.length) {

    area.innerHTML =

      "<p class='note'>" +

      "Waiting for the medical equipment image..." +

      "</p>";

    return;

  }


  area.innerHTML = `

    <div

      style="

        display:flex;

        justify-content:center;

        margin-top:10px

      "

    >

      <div

        style="

          width:min(360px,90vw)

        "

      >

        <div

          style="

            font-size:12px;

            text-align:center;

            margin-bottom:6px;

            color:#aaa

          "

        >

          MEDICAL EQUIPMENT IMAGE

        </div>


        <img

          src="${esc(
            images[0]
          )}"

          data-participant-report="0"

          alt="Medical equipment"

          style="

            width:100%;

            height:420px;

            object-fit:contain;

            background:#111;

            border-radius:10px;

            cursor:zoom-in

          "

        >

      </div>

    </div>


    <p

      class="note"

      style="text-align:center"

    >

      Tap the image to open the large viewer.

    </p>

  `;


  area

    .querySelectorAll(

      "[data-participant-report]"

    )

    .forEach(

      image => {

        image.onclick =

          () =>

            openImageViewer(

              0,

              images

            );

      }

    );

}


/* =========================================================
   PARTICIPANT FINAL RESULTS
   ========================================================= */

function renderParticipantFinal() {

  const box =

    $("participantFinalResults");


  if (!box) {

    return;

  }


  const list =

    Object.values(
      teams
    ).sort(

      (a, b) =>

        money(b.itemsWon) -
        money(a.itemsWon) ||

        money(b.points) -
        money(a.points) ||

        String(a.name)
          .localeCompare(
            String(b.name)
          )

    );


  box.innerHTML = `

    <div class="panel">

      <h3>

        FINAL RESULT — ROUND 2

      </h3>


      <p class="note">

        Winner priority:

        <strong>

          most images/equipment won

        </strong>

        → tie:

        <strong>

          highest remaining points

        </strong>.

      </p>


      ${
        gameState.finalWinnerConfirmed

          ? `

            <div

              style="

                padding:18px;

                border:2px solid #d6b65a;

                border-radius:12px;

                margin-bottom:15px;

                text-align:center

              "

            >

              <div

                style="

                  font-size:13px;

                  color:#d6b65a

                "

              >

                OFFICIAL ROUND 2 WINNER

              </div>


              <strong

                style="font-size:30px"

              >

                ${esc(
                  gameState.finalWinnerName ||
                  ""
                )}

              </strong>

            </div>

          `

          : ""

      }


      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>

              <th>

                Rank

              </th>

              <th>

                Team

              </th>

              <th>

                Images Won

              </th>

              <th>

                Remaining Points

              </th>

              <th>

                Correct

              </th>

              <th>

                Wrong

              </th>

            </tr>

          </thead>


          <tbody>

            ${

              list

                .map(

                  (team, index) => `

                    <tr

                      ${
                        team.id ===
                        gameState.finalWinnerId

                          ? "style='outline:2px solid #d6b65a'"

                          : ""

                      }

                    >

                      <td>

                        ${index + 1}

                      </td>


                      <td>

                        ${esc(
                          team.name
                        )}

                        ${
                          team.id ===
                          gameState.finalWinnerId

                            ? " ★"

                            : ""

                        }

                      </td>


                      <td>

                        ${money(
                          team.itemsWon
                        )}

                      </td>


                      <td>

                        ${money(
                          team.points
                        )}

                      </td>


                      <td>

                        ${money(
                          team.correctAnswers || 0
                        )}

                      </td>


                      <td>

                        ${money(
                          team.wrongAnswers || 0
                        )}

                      </td>

                    </tr>

                  `

                )

                .join("")

            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   FINAL HOST RESULTS
   ========================================================= */

function renderFinalHost() {

  const box =

    $("finalResultsHost");


  if (

    !box ||

    gameState.round !== 3

  ) {

    return;

  }


  const list =

    Object.values(
      teams
    ).sort(

      (a, b) =>

        money(b.itemsWon) -
        money(a.itemsWon) ||

        money(b.points) -
        money(a.points) ||

        String(a.name)
          .localeCompare(
            String(b.name)
          )

    );


  box.innerHTML = `

    <div class="panel">

      <h3>

        FINAL RESULT — ROUND 2

      </h3>


      <p class="note">

        1st priority:

        <strong>

          most images/equipment won

        </strong>.


        2nd priority:

        <strong>

          highest remaining points

        </strong>.

      </p>


      ${
        gameState.finalWinnerConfirmed

          ? `

            <div

              style="

                padding:18px;

                border:2px solid #d6b65a;

                border-radius:12px;

                text-align:center;

                margin-bottom:15px

              "

            >

              <div

                style="

                  color:#d6b65a;

                  font-size:13px

                "

              >

                OFFICIAL ROUND 2 WINNER

              </div>


              <strong

                style="font-size:30px"

              >

                ${esc(
                  gameState.finalWinnerName ||
                  ""
                )}

              </strong>

            </div>

          `

          : ""

      }


      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>

              <th>

                Rank

              </th>

              <th>

                Team

              </th>

              <th>

                Images Won

              </th>

              <th>

                Final Points

              </th>

              <th>

                Correct

              </th>

              <th>

                Wrong

              </th>

            </tr>

          </thead>


          <tbody>

            ${

              list

                .map(

                  (team, index) => `

                    <tr

                      ${
                        team.id ===
                        gameState.finalWinnerId

                          ? "style='outline:2px solid #d6b65a'"

                          : ""

                      }

                    >

                      <td>

                        ${index + 1}

                      </td>


                      <td>

                        ${esc(
                          team.name
                        )}

                        ${
                          team.id ===
                          gameState.finalWinnerId

                            ? " ★"

                            : ""

                        }

                      </td>


                      <td>

                        ${money(
                          team.itemsWon
                        )}

                      </td>


                      <td>

                        ${money(
                          team.points
                        )}

                      </td>


                      <td>

                        ${money(
                          team.correctAnswers || 0
                        )}

                      </td>


                      <td>

                        ${money(
                          team.wrongAnswers || 0
                        )}

                      </td>

                    </tr>

                  `

                )

                .join("")

            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   IMAGE VIEWER
   ========================================================= */

function openImageViewer(

  index = 0,

  images = null

) {

  const list =

    Array.isArray(images) &&

    images.length

      ? images

      : getCurrentReportImages();


  if (!list.length) {

    return;

  }


  let modal =
    $("reportViewer");


  if (!modal) {

    modal =

      document.createElement(
        "div"
      );


    modal.id =
      "reportViewer";


    modal.style.cssText =

      "position:fixed;" +
      "inset:0;" +
      "background:rgba(0,0,0,.94);" +
      "z-index:9999;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "padding:20px";


    modal.innerHTML = `

      <button

        id="closeReportViewer"

        type="button"

        style="

          position:fixed;

          right:20px;

          top:15px;

          background:#111;

          color:#fff;

          border:1px solid #777;

          border-radius:8px;

          padding:10px 16px;

          font-size:20px;

          z-index:2;

          cursor:pointer

        "

      >

        ✕ CLOSE

      </button>


      <div

        style="

          width:min(900px,95vw);

          height:min(900px,92vh);

          display:flex;

          align-items:center;

          justify-content:center;

          overflow:auto

        "

      >

        <img

          id="reportViewerImage"

          style="

            max-width:100%;

            max-height:100%;

            object-fit:contain;

            background:#111

          "

          alt="Medical equipment"

        >

      </div>

    `;


    document.body.appendChild(
      modal
    );


    $("closeReportViewer")

      ?.addEventListener(

        "click",

        () => {

          hide(modal);

        }

      );

  }


  const safeIndex =

    Math.max(

      0,

      Math.min(

        Number(index) || 0,

        list.length - 1

      )

    );


  $("reportViewerImage").src =
    list[safeIndex];


  show(modal);

}
/* =========================================================
   ENTER KEY
   Only these 3 inputs use Enter:
   - teamNameInput
   - hostPasswordInput
   - bidInput

   No global input blocking.
   ========================================================= */

document.addEventListener(

  "keydown",

  event => {

    if (
      event.key !== "Enter"
    ) {

      return;

    }


    const id =
      event.target?.id;


    if (
      id === "teamNameInput"
    ) {

      event.preventDefault();

      event.stopPropagation();

      participantLogin();

      return;

    }


    if (
      id === "hostPasswordInput"
    ) {

      event.preventDefault();

      event.stopPropagation();

      hostLogin();

      return;

    }


    if (
      id === "bidInput"
    ) {

      event.preventDefault();

      event.stopPropagation();

      placeBid();

    }

  }

);


/* =========================================================
   EVENT BINDINGS
   ========================================================= */

   function activateHostPanel(panelId) {
    const panelIds = [
        "hostOverviewPanel",
        "hostRound1Panel",
        "hostRound2Panel",
        "hostFinalPanel"
    ];

    panelIds.forEach(id => {
        const panel = $(id);

        if (panel) {
            panel.classList.toggle("hidden", id !== panelId);
        }
    });

    document.querySelectorAll(".side-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.panel === panelId
        );
    });
}

function setupNavigation() {
    document.querySelectorAll(".side-btn").forEach(button => {
        button.addEventListener("click", () => {
            const panelId = button.dataset.panel;

            if (!panelId) return;

            activateHostPanel(panelId);
        });
    });
}
function bindEvents() {

  /* -------------------------------------------------------
     LOGIN
     ------------------------------------------------------- */

  $("participantLoginBtn")
    ?.addEventListener(

      "click",

      participantLogin

    );


  $("hostLoginBtn")
    ?.addEventListener(

      "click",

      hostLogin

    );


  /* -------------------------------------------------------
     ROUND 1
     ------------------------------------------------------- */

  $("startRound1Btn")
    ?.addEventListener(

      "click",

      startRound1

    );


  $("endRound1BidBtn")
    ?.addEventListener(

      "click",

      closeRound1Bid

    );


  $("endRound1Btn")
    ?.addEventListener(

      "click",

      endRound1

    );


  $("qualifyTeamsBtn")
    ?.addEventListener(

      "click",

      () => {

        const pane =
          $("round1QualificationPane");


        if (
          gameState.round1Ended &&
          pane
        ) {

          pane.scrollIntoView({

            behavior:
              "smooth",

            block:
              "start"

          });

        }

      }

    );


  /* -------------------------------------------------------
     ROUND 2

     Dynamic Round 2 controls are bound inside
     renderRound2Host().

     Do NOT bind award/skip actions.
     ------------------------------------------------------- */


  $("placeBidBtn")
    ?.addEventListener(

      "click",

      placeBid

    );


  /* -------------------------------------------------------
     HOST LOGOUT
     ------------------------------------------------------- */

  $("logoutHostBtn")
    ?.addEventListener(

      "click",

      () => {

        location.reload();

      }

    );


  /* -------------------------------------------------------
     RESET GAME
     ------------------------------------------------------- */

  $("resetGameBtn")
    ?.addEventListener(

      "click",

      () => {

        const confirmed =
          window.confirm(
            "Reset the entire game?"
          );


        if (!confirmed) {

          return;

        }


        send({

          type:
            "reset-game"

        });

      }

    );

}


/* =========================================================
   UPDATE EVERYTHING
   ========================================================= */

function updateEverything() {

  /* -------------------------------------------------------
     GLOBAL OVERVIEW
     ------------------------------------------------------- */

  updateOverview();


  /* -------------------------------------------------------
     HOST
     ------------------------------------------------------- */

  if (
    role === "host"
  ) {

    setText(

      "gameStatus",

      String(

        gameState.status ||
        "idle"

      ).toUpperCase()

    );


    setText(

      "hostRoundLabel",

      gameState.round === 1

        ? "ROUND 1"

        : gameState.round === 2

          ? "ROUND 2"

          : gameState.round === 3

            ? "FINAL RESULTS"

            : "LOBBY"

    );


    renderRound1Bids();

    renderRound1Selection();

    renderRound1Summary();

    renderRound2Host();

    renderFinalHost();


    /* -----------------------------------------------------
       ROUND 1 SELECTION PANE

       Only visible after host ends Round 1.
       ----------------------------------------------------- */

    const qualificationPane =
      $("round1QualificationPane");


    if (
      gameState.round === 1 &&
      gameState.round1Ended
    ) {

      show(
        qualificationPane
      );

    }


    /* -----------------------------------------------------
       ROUND 2

       When Round 2 begins, show only Round 2.
       ----------------------------------------------------- */

    if (
      gameState.round === 2 &&
      gameState.qualifiedTeamIds?.length
    ) {

      show(
        $("hostRound2Panel")
      );

      hide(
        $("round1QualificationPane")
      );

    }


    /* -----------------------------------------------------
       FINAL
       ----------------------------------------------------- */

    if (
      gameState.round === 3
    ) {

      show(
        $("finalResultsHost")
      );

      hide(
        $("hostRound2Panel")
      );

      hide(
        $("round1QualificationPane")
      );

    }

  }


  /* -------------------------------------------------------
     PARTICIPANT
     ------------------------------------------------------- */

  if (
    role === "participant"
  ) {

    updateParticipant();

  }


  /* -------------------------------------------------------
     TIMER
     ------------------------------------------------------- */

  startTimerLoop();

}


/* =========================================================
   START APPLICATION
   ========================================================= */

bindEvents();

setupNavigation();

connectSocket();