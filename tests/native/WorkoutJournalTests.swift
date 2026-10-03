import Foundation

@main struct WorkoutJournalTests {
    static func main() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let owner = UUID().uuidString, activity = UUID().uuidString
        let journal = try WorkoutJournal(owner: owner, activity: activity, directory: dir)
        for index in 0..<301 { try journal.append(["ownerId": owner, "activityId": activity, "kind": index == 0 ? "start" : "point", "timestampMs": 1000 + index, "lat": 1, "lng": 2]) }
        let recovered = try WorkoutJournal(owner: owner, activity: activity, directory: dir)
        precondition(recovered.events.count == 301 && recovered.events.last?["sequence"] as? Int == 301)
        let h = try FileHandle(forWritingTo: journal.url); try h.seekToEnd(); try h.write(contentsOf: Data("{\"torn\":".utf8)); try h.close()
        let repaired = try WorkoutJournal(owner: owner, activity: activity, directory: dir)
        precondition(repaired.events.count == 301)
        try repaired.append(["ownerId": owner, "activityId": activity, "kind": "end", "timestampMs": 5000])
        precondition(repaired.events.last?["sequence"] as? Int == 302)
        let corrupt = Data("{broken}\n".utf8); try corrupt.write(to: journal.url)
        do { _ = try WorkoutJournal(owner: owner, activity: activity, directory: dir); preconditionFailure("Corruption must remain visible") }
        catch { let retained = try Data(contentsOf: journal.url); precondition(retained == corrupt) }
        do { _ = try WorkoutJournal(owner: "invalid", activity: activity, directory: dir); preconditionFailure("Invalid owner accepted") } catch {}
        print("PASS: durable append, restart, torn-write repair, sequence, corruption preservation and identity")
    }
}
