import Foundation

/** A complete append is durable before its sequence is exposed to the bridge. */
final class WorkoutJournal {
    let url: URL
    private(set) var events: [[String: Any]] = []
    init(owner: String, activity: String, directory: URL? = nil) throws {
        guard UUID(uuidString: owner) != nil, UUID(uuidString: activity) != nil else { throw NSError(domain: "SVJJournalIdentity", code: 1) }
        let dir = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("SVJWorkouts", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent(owner + "_" + activity + ".jsonl")
        if FileManager.default.fileExists(atPath: url.path) {
            let data = try Data(contentsOf: url)
            guard let text = String(data: data, encoding: .utf8) else { throw NSError(domain: "SVJJournalCorruption", code: 2) }
            let lines = text.components(separatedBy: "\n")
            for (index, line) in lines.enumerated() where !line.isEmpty {
                guard let value = try? JSONSerialization.jsonObject(with: Data(line.utf8)), let event = value as? [String: Any] else {
                    // Only an unterminated final line can be an interrupted append.
                    if index == lines.count - 1 && !text.hasSuffix("\n") { break }
                    throw NSError(domain: "SVJJournalCorruption", code: 3)
                }
                guard event["sequence"] as? Int == events.count + 1, event["ownerId"] as? String == owner, event["activityId"] as? String == activity else { throw NSError(domain: "SVJJournalCorruption", code: 4) }
                events.append(event)
            }
            if !text.isEmpty && !text.hasSuffix("\n") {
                var clean = Data()
                for event in events { clean.append(try JSONSerialization.data(withJSONObject: event)); clean.append(10) }
                try clean.write(to: url, options: .atomic)
            }
        } else { try Data().write(to: url, options: .atomic) }
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
        var resource = url; var values = URLResourceValues(); values.isExcludedFromBackup = true; try resource.setResourceValues(values)
    }
    func append(_ value: [String: Any]) throws {
        var event = value; event["sequence"] = events.count + 1
        let data = try JSONSerialization.data(withJSONObject: event) + Data([10])
        let handle = try FileHandle(forWritingTo: url); defer { try? handle.close() }
        try handle.seekToEnd(); try handle.write(contentsOf: data); try handle.synchronize()
        events.append(event)
    }
}
