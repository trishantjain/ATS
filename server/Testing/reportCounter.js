const mongoose = require("mongoose");

/*
 * MongoDB-backed global report counter.
 *
 * This counter is shared by every ATS system that connects to the
 * same MongoDB database.
 *
 * Example:
 *   iMoni-SRMS-0350
 *   iMoni-SRMS-0351
 *
 * Multiple systems can request numbers at the same time because
 * MongoDB's $inc operation is atomic.
 */

const COUNTER_COLLECTION = "reportCounters";
const SUPPORTED_PREFIXES = new Set(["FAN", "iMoni-Base", "iMoni-SRMS"]);

// Number of digits used in the report number.
const REPORT_NUMBER_WIDTH = 4;

// Existing report number format:
// iMoni-SRMS-0001
// iMoni-Base-0001
// FAN-0001

function getCounterId(prefix) {
  return String(prefix).trim();
}

function formatReportNumber(prefix, number) {
  return `${prefix}-${String(number).padStart(REPORT_NUMBER_WIDTH, "0")}`;
}

/*
 * Find the highest existing report number for this prefix.
 *
 * This is only used when the counter document does not exist yet.
 *
 * This is important because you may already have reports such as:
 *
 *   iMoni-SRMS-0349
 *
 * We must continue from 0350 rather than starting again at 0001.
 */
async function getExistingHighestNumber(prefix) {
  const collection = mongoose.connection.db.collection("testedcontrollers");

  const regex = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`, "i");

  const result = await collection
    .aggregate([
      {
        $match: {
          reportNo: {
            $regex: regex,
          },
        },
      },
      {
        $project: {
          numericReportNo: {
            $let: {
              vars: {
                match: {
                  $regexFind: {
                    input: "$reportNo",
                    regex,
                  },
                },
              },
              in: {
                $convert: {
                  input: {
                    $arrayElemAt: ["$$match.captures", 0],
                  },
                  to: "long",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
      },
      {
        $match: {
          numericReportNo: {
            $gt: 0,
          },
        },
      },
      {
        $group: {
          _id: null,
          maxNumber: {
            $max: "$numericReportNo",
          },
        },
      },
    ])
    .toArray();

  return result[0]?.maxNumber || 0;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Get the next global report number.
 *
 * IMPORTANT:
 * The actual increment happens inside MongoDB.
 *
 * Therefore:
 *
 * System A -> $inc -> 350
 * System B -> $inc -> 351
 *
 * even when both requests happen almost simultaneously.
 */
async function getNextReportNumber(prefix) {
  if (!SUPPORTED_PREFIXES.has(prefix)) {
    throw new Error(
      `Unsupported report number prefix: ${prefix}`
    );
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected");
  }

  const counterId = getCounterId(prefix);
  const counters = mongoose.connection.db.collection(
    COUNTER_COLLECTION
  );

  const existingCounter = await counters.findOne({
    _id: counterId,
  });

  if (!existingCounter) {
    const existingHighestNumber =
      await getExistingHighestNumber(prefix);

    await counters.updateOne(
      { _id: counterId },
      {
        $setOnInsert: {
          lastNumber: existingHighestNumber,
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
      }
    );
  }

  /*
   * THIS is the important atomic operation.
   *
   * MongoDB guarantees that concurrent $inc operations receive
   * different values.
   */
  const result = await counters.findOneAndUpdate(
    { _id: counterId },
    {
      $inc: {
        lastNumber: 1,
      },
      $set: {
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
    }
  );

  const lastNumber =
    result?.value?.lastNumber ?? result?.lastNumber;

  if (!Number.isSafeInteger(lastNumber)) {
    throw new Error(
      `Invalid report counter value for ${counterId}`
    );
  }

  return formatReportNumber(prefix, lastNumber);
}

module.exports = {
  getNextReportNumber,
};