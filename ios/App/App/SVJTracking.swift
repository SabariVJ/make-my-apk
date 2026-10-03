import Foundation
import UIKit
import Capacitor
import CoreMotion
import CoreLocation

final class SVJBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VjPedometerPlugin())
        bridge?.registerPluginInstance(VjWorkoutPlugin())
    }
}

@objc(VjPedometerPlugin)
public final class VjPedometerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VjPedometerPlugin"
    public let jsName = "VjPedometer"
    public let pluginMethods: [CAPPluginMethod] = [
        "getDailyState", "enableDailyTracking", "disableDailyTracking", "openSettings",
        "checkPermissions", "requestPermissions", "isAvailable", "getSensorInfo", "getState",
        "startTracking", "stopTracking", "getMeasurement"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let daily = CMPedometer()
    private let session = CMPedometer()
    private var sessionId = ""
    private var sessionStart: Date?
    private var sessionSteps = 0
    private var lastError: String?
    private let defaults = UserDefaults.standard
    private var dailyGeneration = 0
    private func permission() -> String {
        switch CMPedometer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }
    private func day() -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = Calendar(identifier: .gregorian); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
    private func snapshot(_ owner: String) -> [String: Any] {
        let cached = defaults.dictionary(forKey: "svj.daily.snapshot." + owner) ?? [:]
        let enabled = defaults.bool(forKey: "svj.daily.enabled") && defaults.string(forKey: "svj.daily.owner") == owner
        return ["version": 2, "ownerId": owner, "enabled": enabled, "available": CMPedometer.isStepCountingAvailable(),
                "listening": false, "permission": permission(), "dateKey": day(),
                "steps": cached["dateKey"] as? String == day() ? (cached["steps"] as? Int ?? 0) : 0,
                "raw": NSNull(), "measurementAt": cached["dateKey"] as? String == day() ? (cached["measurementAt"] ?? NSNull()) : NSNull(), "source": "iPhone Motion", "error": lastError as Any? ?? NSNull()]
    }
    private func readDaily(_ call: CAPPluginCall, owner: String) {
        guard CMPedometer.isStepCountingAvailable() else { call.resolve(snapshot(owner)); return }
        let generation = dailyGeneration
        let end = Date(), dateKey = day()
        let start = Calendar.current.startOfDay(for: end)
        daily.queryPedometerData(from: start, to: end) { [weak self] data, error in
            DispatchQueue.main.async {
                guard let self = self else { call.reject("Tracking is unavailable"); return }
                guard generation == self.dailyGeneration, self.defaults.string(forKey: "svj.daily.owner") == owner else { call.reject("Account changed"); return }
                self.lastError = error == nil ? nil : "Motion readings are unavailable. Check Motion & Fitness permission."
                if let data = data {
                    self.defaults.set(["dateKey": dateKey, "steps": data.numberOfSteps.intValue, "measurementAt": data.endDate.timeIntervalSince1970 * 1000], forKey: "svj.daily.snapshot." + owner)
                }
                call.resolve(self.snapshot(owner))
            }
        }
    }
    @objc func getDailyState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let owner = call.getString("ownerId") ?? ""
            if self.defaults.string(forKey: "svj.daily.owner") != owner {
                self.dailyGeneration += 1; self.daily.stopUpdates(); self.defaults.set(false, forKey: "svj.daily.enabled")
                self.defaults.set(owner, forKey: "svj.daily.owner")
            }
            if self.defaults.bool(forKey: "svj.daily.enabled") && self.permission() == "granted" { self.readDaily(call, owner: owner) }
            else { call.resolve(self.snapshot(owner)) }
        }
    }
    @objc func enableDailyTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let owner = call.getString("ownerId"), !owner.isEmpty else { call.reject("Sign in first"); return }
            self.dailyGeneration += 1; self.defaults.set(owner, forKey: "svj.daily.owner"); self.defaults.set(true, forKey: "svj.daily.enabled")
            self.readDaily(call, owner: owner)
        }
    }
    @objc func disableDailyTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dailyGeneration += 1; self.daily.stopUpdates(); self.defaults.set(false, forKey: "svj.daily.enabled")
            call.resolve(self.snapshot(self.defaults.string(forKey: "svj.daily.owner") ?? ""))
        }
    }
    @objc func openSettings(_ call: CAPPluginCall) { DispatchQueue.main.async { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!); call.resolve() } }
    @objc public override func checkPermissions(_ call: CAPPluginCall) { call.resolve(["activityRecognition": permission()]) }
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        session.queryPedometerData(from: Date().addingTimeInterval(-1), to: Date()) { _, _ in call.resolve(["activityRecognition": self.permission()]) }
    }
    @objc func isAvailable(_ call: CAPPluginCall) { call.resolve(["stepCounting": CMPedometer.isStepCountingAvailable(), "sensorManager": true]) }
    @objc func getSensorInfo(_ call: CAPPluginCall) { call.resolve(["mode": "counter", "available": CMPedometer.isStepCountingAvailable(), "name": "Core Motion", "vendor": "Apple", "type": 0, "debug": false, "permission": permission()]) }
    private func state() -> [String: Any] {
        let active = sessionStart != nil
        return ["trackingRequested": active, "trackingActive": active, "listenerRegistered": active, "listenerRemoved": !active, "sensorStarted": active,
                "sensorAvailable": CMPedometer.isStepCountingAvailable(), "mode": "counter", "sessionId": sessionId, "sessionSteps": sessionSteps,
                "sessionStartedMs": (sessionStart?.timeIntervalSince1970 ?? 0) * 1000, "lastError": lastError as Any? ?? NSNull()]
    }
    @objc func getState(_ call: CAPPluginCall) { call.resolve(state()) }
    @objc func startTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.permission() == "granted", CMPedometer.isStepCountingAvailable(), let id = call.getString("sessionId") else { call.reject("Motion permission is required"); return }
            self.session.stopUpdates(); self.sessionId = id; self.sessionStart = Date(); self.sessionSteps = 0
            self.session.startUpdates(from: self.sessionStart!) { data, error in
                DispatchQueue.main.async {
                    guard self.sessionId == id, self.sessionStart != nil else { return }
                    if error != nil { self.lastError = "Motion readings stopped. Check permission."; self.session.stopUpdates(); self.sessionStart = nil; self.notifyListeners("trackingStateChanged", data: self.state()); return }
                    guard let data = data else { return }
                    self.sessionSteps = data.numberOfSteps.intValue
                    var event = self.state(); event["timestamp"] = data.endDate.timeIntervalSince1970 * 1000; event["rawValue"] = self.sessionSteps
                    self.notifyListeners("measurement", data: event)
                }
            }
            call.resolve(self.state())
        }
    }
    @objc func stopTracking(_ call: CAPPluginCall) { DispatchQueue.main.async { self.session.stopUpdates(); self.sessionStart = nil; call.resolve(self.state()) } }
    @objc func getMeasurement(_ call: CAPPluginCall) {
        let start = Date(timeIntervalSince1970: (call.getDouble("start") ?? 0) / 1000)
        let end = Date(timeIntervalSince1970: (call.getDouble("end") ?? Date().timeIntervalSince1970 * 1000) / 1000)
        session.queryPedometerData(from: start, to: end) { data, error in
            if let data = data { call.resolve(["numberOfSteps": data.numberOfSteps.intValue]) } else { call.reject("Motion history unavailable") }
        }
    }
}

@objc(VjWorkoutPlugin)
public final class VjWorkoutPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "VjWorkoutPlugin"
    public let jsName = "VjWorkout"
    public let pluginMethods: [CAPPluginMethod] = ["isAvailable", "checkPermissions", "requestPermissions", "startWorkout", "pauseWorkout", "resumeWorkout", "stopWorkout", "getState", "readJournal", "clearJournal", "listRecordings"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private var manager: CLLocationManager!
    private var journal: WorkoutJournal?
    private var metadata: [String: Any] = [:]
    private var permissionCall: CAPPluginCall?
    private var active = false, paused = false
    private let motion = CMPedometer()
    private var motionStart: Date?
    private var motionBase = 0, motionTotal = 0, motionGeneration = 0
    private var commandPending = false
    public override func load() {
        DispatchQueue.main.async {
            self.manager = CLLocationManager(); self.manager.delegate = self
            self.manager.activityType = .fitness; self.manager.desiredAccuracy = kCLLocationAccuracyBest
            self.manager.distanceFilter = 3; self.manager.pausesLocationUpdatesAutomatically = false
            self.manager.allowsBackgroundLocationUpdates = true; self.manager.showsBackgroundLocationIndicator = true
            if let saved = UserDefaults.standard.dictionary(forKey: "svj.workout.v2") { self.metadata = saved; self.paused = saved["endedAtMs"] == nil }
        }
    }
    private func permission() -> String {
        switch CLLocationManager.authorizationStatus() {
        case .authorizedAlways, .authorizedWhenInUse: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }
    private func permissions() -> [String: Any] { return ["location": permission(), "backgroundLocation": permission(), "notifications": "unavailable"] }
    private func state() -> [String: Any] { var s = metadata; s["version"] = 2; s["active"] = active; s["paused"] = paused; s["pointCount"] = journal?.events.filter { $0["kind"] as? String == "point" }.count ?? 0; return s }
    private func accepts(_ call: CAPPluginCall) -> Bool {
        guard let owner = call.getString("ownerId"), let id = call.getString("activityId"), metadata["ownerId"] as? String == owner, metadata["activityId"] as? String == id else { call.reject("This command belongs to another recording. Reopen SVJ."); return false }
        return true
    }
    private func interrupt(_ message: String) {
        manager.stopUpdatingLocation(); motion.stopUpdates(); motionGeneration += 1; motionStart = nil
        try? record("pause"); paused = true; active = false; metadata["error"] = message
        UserDefaults.standard.set(metadata, forKey: "svj.workout.v2")
        notifyListeners("workoutState", data: state())
    }
    private func record(_ kind: String, extra: [String: Any] = [:]) throws {
        guard let journal = journal else { throw NSError(domain: "SVJ", code: 2) }
        var event = extra; event["kind"] = kind; event["timestampMs"] = extra["timestampMs"] ?? Date().timeIntervalSince1970 * 1000
        event["activityId"] = metadata["activityId"]; event["ownerId"] = metadata["ownerId"]
        try journal.append(event)
        notifyListeners("journalChanged", data: state())
    }
    private func motionSample(_ data: CMPedometerData, base: Int) {
        let total = max(motionTotal, base + data.numberOfSteps.intValue)
        guard total != motionTotal else { return }
        do {
            try record("steps", extra: ["steps": total, "timestampMs": data.endDate.timeIntervalSince1970 * 1000])
            motionTotal = total; metadata["workoutSteps"] = total; UserDefaults.standard.set(metadata, forKey: "svj.workout.v2")
        } catch { metadata["motionError"] = "Could not save workout steps. Check device storage." }
    }
    private func startMotion() {
        guard CMPedometer.isStepCountingAvailable(), CMPedometer.authorizationStatus() == .authorized else { metadata["motionStatus"] = "Motion permission or step sensor unavailable"; return }
        motionGeneration += 1; let generation = motionGeneration
        let start = Date(); motionStart = start; motionBase = motionTotal
        let base = motionBase
        motion.startUpdates(from: start) { data, error in DispatchQueue.main.async {
            guard generation == self.motionGeneration, self.active, !self.paused else { return }
            if let data = data { self.motionSample(data, base: base) }
            if error != nil { self.metadata["motionError"] = "Motion readings unavailable. Check Motion & Fitness permission." }
        } }
    }
    private func finishMotion(at end: Date, completion: @escaping () -> Void) {
        motion.stopUpdates(); motionGeneration += 1
        guard let start = motionStart else { completion(); return }
        motionStart = nil; let base = motionBase
        var finished = false
        let finish: (CMPedometerData?) -> Void = { data in
            guard !finished else { return }; finished = true
            if let data = data { self.motionSample(data, base: base) }
            else { self.metadata["motionError"] = "Final workout steps unavailable. Route data is retained." }
            completion()
        }
        motion.queryPedometerData(from: start, to: end) { data, _ in DispatchQueue.main.async { finish(data) } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { finish(nil) }
    }
    @objc func isAvailable(_ call: CAPPluginCall) { call.resolve(["available": true, "version": 2, "journal": true, "revision": Bundle.main.object(forInfoDictionaryKey: "SVJBuildRevision") ?? "unknown"]) }
    @objc public override func checkPermissions(_ call: CAPPluginCall) { call.resolve(permissions()) }
    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.permission() != "prompt" { call.resolve(self.permissions()); return }
            if self.permissionCall != nil { call.reject("Permission request already in progress"); return }
            self.permissionCall = call; self.manager.requestWhenInUseAuthorization()
        }
    }
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if permission() != "prompt" { permissionCall?.resolve(permissions()); permissionCall = nil }
        if active && permission() != "granted" { interrupt("Location permission was revoked. Allow Location in Settings before resuming.") }
    }
    @objc func startWorkout(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.permission() == "granted", let owner = call.getString("ownerId"), let id = call.getString("activityId") else { call.reject("Location permission and signed-in account are required"); return }
            if self.active { if self.metadata["activityId"] as? String == id && self.metadata["ownerId"] as? String == owner { call.resolve(self.state()) } else { call.reject("Finish the current workout first") }; return }
            do {
                guard !self.commandPending else { call.reject("Recording command in progress"); return }
                guard self.metadata.isEmpty || self.metadata["endedAtMs"] != nil else { call.reject("Save or discard the recovered workout first"); return }
                self.journal = try WorkoutJournal(owner: owner, activity: id)
                guard self.journal?.events.isEmpty == true else { call.reject("This recording already exists. Recover it before starting another."); return }
                self.metadata = ["ownerId": owner, "activityId": id, "activityType": call.getString("activityType") ?? "walking", "startedAtMs": call.getDouble("startedAtMs") ?? Date().timeIntervalSince1970 * 1000]
                self.motionTotal = 0
                UserDefaults.standard.set(self.metadata, forKey: "svj.workout.v2")
                try self.record("start", extra: self.metadata); self.active = true; self.paused = false
                self.manager.startUpdatingLocation(); self.startMotion(); call.resolve(self.state())
            } catch { call.reject("Could not safely save the recording on this device") }
        }
    }
    @objc func pauseWorkout(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.accepts(call) else { return }
        guard !self.commandPending else { call.reject("Recording command in progress"); return }
        if !self.active || self.paused { call.resolve(self.state()); return }
        let at = Date(); self.commandPending = true; self.manager.stopUpdatingLocation()
        self.finishMotion(at: at) { defer { self.commandPending = false }
            do { try self.record("pause", extra: ["timestampMs": at.timeIntervalSince1970 * 1000]); self.paused = true; call.resolve(self.state()) }
            catch { self.paused = true; call.reject("Could not save pause state") }
        }
    } }
    @objc func resumeWorkout(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.accepts(call) else { return }
        do {
            guard !self.commandPending, self.metadata["endedAtMs"] == nil else { call.reject("Finish command pending or workout ended"); return }
            guard self.permission() == "granted" else { call.reject("Location permission is required"); return }
            if self.journal == nil, let owner = self.metadata["ownerId"] as? String, let id = self.metadata["activityId"] as? String { self.journal = try WorkoutJournal(owner: owner, activity: id) }
            if !self.active || self.paused { try self.record("resume") }
            self.motionTotal = self.metadata["workoutSteps"] as? Int ?? self.motionTotal
            self.active = true; self.paused = false; self.manager.startUpdatingLocation(); self.startMotion(); call.resolve(self.state())
        } catch { call.reject("Could not resume the recording") }
    } }
    @objc func stopWorkout(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.accepts(call) else { return }
        guard !self.commandPending else { call.reject("Recording command in progress"); return }
        self.manager.stopUpdatingLocation()
        if self.metadata.isEmpty || self.metadata["endedAtMs"] != nil { self.active = false; call.resolve(self.state()); return }
        let at = Date(); self.commandPending = true
        self.finishMotion(at: at) { defer { self.commandPending = false }
            do {
                if self.journal == nil, let owner = self.metadata["ownerId"] as? String, let id = self.metadata["activityId"] as? String { self.journal = try WorkoutJournal(owner: owner, activity: id) }
                try self.record("end", extra: ["timestampMs": at.timeIntervalSince1970 * 1000])
                self.metadata["endedAtMs"] = at.timeIntervalSince1970 * 1000; UserDefaults.standard.set(self.metadata, forKey: "svj.workout.v2")
                self.active = false; self.paused = false; call.resolve(self.state())
            } catch { self.active = false; self.paused = true; call.reject("Could not safely finish the recording") }
        }
    } }
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.state()) } }
    @objc func listRecordings(_ call: CAPPluginCall) { DispatchQueue.main.async { do {
        guard let owner = call.getString("ownerId"), UUID(uuidString: owner) != nil else { call.reject("Sign in first"); return }
        let dir = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("SVJWorkouts", isDirectory: true)
        let urls = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var recordings: [[String: Any]] = []
        for url in urls where url.lastPathComponent.hasPrefix(owner + "_") && url.pathExtension == "jsonl" {
            let id = String(url.deletingPathExtension().lastPathComponent.dropFirst(owner.count + 1))
            let journal = try WorkoutJournal(owner: owner, activity: id)
            if var header = journal.events.first { header["ended"] = journal.events.contains { $0["kind"] as? String == "end" }; recordings.append(header) }
        }
        call.resolve(["recordings": recordings])
    } catch { call.reject("Could not read retained recordings") } } }
    @objc func readJournal(_ call: CAPPluginCall) { DispatchQueue.main.async { do {
        guard let owner = call.getString("ownerId"), let id = call.getString("activityId") else { call.reject("Missing workout identity"); return }
        let j = self.metadata["ownerId"] as? String == owner && self.metadata["activityId"] as? String == id ? self.journal : nil
        let reader = try j ?? WorkoutJournal(owner: owner, activity: id)
        let after = max(0, call.getInt("afterSequence") ?? 0); let limit = min(500, max(1, call.getInt("limit") ?? 250))
        call.resolve(["events": Array(reader.events.dropFirst(after).prefix(limit))])
    } catch { call.reject("Could not read saved recording") } } }
    @objc func clearJournal(_ call: CAPPluginCall) { DispatchQueue.main.async { do {
        guard let owner = call.getString("ownerId"), let id = call.getString("activityId"), call.getBool("confirmed") == true else { call.reject("Save or discard confirmation required"); return }
        guard !(self.active && self.metadata["activityId"] as? String == id) else { call.reject("Stop recording first"); return }
        let old = try WorkoutJournal(owner: owner, activity: id); try FileManager.default.removeItem(at: old.url)
        if self.metadata["ownerId"] as? String == owner && self.metadata["activityId"] as? String == id { self.metadata = [:]; self.journal = nil; UserDefaults.standard.removeObject(forKey: "svj.workout.v2") }
        call.resolve()
    } catch { call.reject("Could not clear confirmed recording") } } }
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active && !paused && !commandPending else { return }
        for location in locations where location.horizontalAccuracy >= 0 && location.timestamp.timeIntervalSince1970 * 1000 >= (metadata["startedAtMs"] as? Double ?? 0) {
            do { try record("point", extra: ["lat": location.coordinate.latitude, "lng": location.coordinate.longitude, "accuracy": location.horizontalAccuracy, "elevation": location.altitude, "timestampMs": location.timestamp.timeIntervalSince1970 * 1000]) }
            catch { interrupt("Device storage is full. Your saved route is retained."); return }
        }
    }
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { interrupt("Location permission was revoked. Your recording is paused.") }
    }
}
