import Job from '../models/Job.js'
import { StatusCodes } from 'http-status-codes'
import { BadRequestError, NotFoundError } from '../errors/index.js'
import mongoose from 'mongoose'
import moment from 'moment'

const createJob = async (req, res) => {
	const { jobName, jobNumber } = req.body

	if (!jobName || !jobNumber) {
		throw new BadRequestError('Please Provide All Values')
	}

	req.body.createdBy = req.user.userId

	const job = await Job.create(req.body)
	res.status(StatusCodes.CREATED).json({ job })
}
const getAllJobs = async (req, res) => {
	const {
		search,
		client,
		jobNumber,
		status,
		jobType,
		sort,
		startDate,
		endDate,
	} = req.query

	const queryObject = {}

	const sdDate = startDate
	const sdmonth = moment(sdDate).month()
	const sdyear = moment(sdDate).year()
	const startDateFormatted = new Date(sdyear, 1, 1)

	const edDate = endDate
	const edMonth = moment(edDate).month()
	const edYear = moment(edDate).year()
	const endDateFormatted = new Date(edYear, edMonth + 1, 1)

	const dateFilter = {
		date: {
			$gte: startDateFormatted,
			$lte: endDateFormatted,
		},
	}

	if (status && status !== 'all') {
		queryObject.status = status
	}
	if (jobType && jobType !== 'all') {
		queryObject.jobType = jobType
	}

	if (search) {
		queryObject.jobNumber = { $regex: search, $options: 'i' }
	}
	if (client) {
		queryObject.client = { $regex: client, $options: 'i' }
	}
	if (jobNumber) {
		queryObject.jobNumber = { $regex: jobNumber, $options: 'i' }
	}

	// // NO AWAIT
	let result = Job.find(queryObject).where(dateFilter)

	// chain sort conditions
	if (sort === 'latest') {
		result = result.sort('-date')
	}
	if (sort === 'oldest') {
		result = result.sort('date')
	}
	if (sort === 'a-z') {
		result = result.sort('jobName')
	}
	if (sort === 'z-a') {
		result = result.sort('-jobName')
	}

	// setup pagination
	const page = Number(req.query.page) || 1
	const limit = Number(req.query.limit) || 10
	const skip = (page - 1) * limit

	result = result.skip(skip).limit(limit)

	const jobs = await result

	const totalJobs = await Job.countDocuments(queryObject)
	const numOfPages = Math.ceil(totalJobs / limit)

	res.status(StatusCodes.OK).json({ jobs, totalJobs, numOfPages })
}

const updateJob = async (req, res) => {
	const { id: jobId } = req.params

	const { jobNumber, jobName } = req.body

	if (!jobNumber || !jobName) {
		throw new BadRequestError('Please Provide All Values')
	}

	const job = await Job.findOne({ _id: jobId })

	if (!job) {
		throw new NotFoundError(`No job with id ${jobId}`)
	}

	// check permissions

	const updatedJob = await Job.findOneAndUpdate({ _id: jobId }, req.body, {
		new: true,
		runValidators: true,
	})

	res.status(StatusCodes.OK).json({ updatedJob })
}

const deleteJob = async (req, res) => {
	const { id: jobId } = req.params

	const job = await Job.findOne({ _id: jobId })

	if (!job) {
		throw new CustomError.NotFoundError(`No job with id : ${jobId}`)
	}

	// checkPermissions(req.user, job.createdBy)

	await job.remove()
	res.status(StatusCodes.OK).json({ msg: 'Success! Job removed' })
}
const showStats = async (req, res) => {
	const today = moment()
	const sdmonth = moment(today).month()
	const sdyear = moment(today).year()
	const yearStart = new Date(sdyear, -1, 1)

	let stats = await Job.aggregate([
		{ $match: { status: 'approved' } },
		{ $match: { date: { $gte: yearStart } } },
		{ $group: { _id: '$jobType', count: { $sum: '$amount' } } },
	])
	stats = stats.reduce((acc, curr) => {
		const { _id: title, count } = curr
		acc[title] = count
		return acc
	}, {})

	const defaultStats = {
		mcdonalds: stats["McDonald's"] || 0,
		pmpediatrics: stats['PM Pediatrics'] || 0,
		socialMediaComms: stats['Social Media Comms'] || 0,
	}

	let monthlyApplications = await Job.aggregate([
		{ $match: { status: 'approved' } },
		{ $match: { date: { $gte: yearStart } } },
		{
			$group: {
				_id: {
					year: {
						$year: '$date',
					},
					month: {
						$month: '$date',
					},
				},
				revenue: { $sum: '$amount' },
			},
		},
		{ $sort: { '_id.year': -1, '_id.month': -1 } },
	])

	monthlyApplications = monthlyApplications
		.map((item) => {
			const {
				_id: { year, month },
				revenue,
			} = item
			// accepts 0-11
			const date = moment()
				.month(month - 1)
				.year(year)
				.format('MMM Y')
			return { date, revenue }
		})
		.reverse()

	res.status(StatusCodes.OK).json({ defaultStats, monthlyApplications })
}
export { createJob, getAllJobs, updateJob, deleteJob, showStats }
